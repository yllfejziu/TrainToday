import Capacitor
import Foundation
import HealthKit

@objc(HealthKitPlugin)
public final class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readRecent", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private let iso = ISO8601DateFormatter()

    private var readTypes: Set<HKObjectType> {
        let identifiers: [HKQuantityTypeIdentifier] = [
            .heartRateVariabilitySDNN,
            .restingHeartRate,
            .stepCount,
            .distanceWalkingRunning,
            .distanceCycling,
            .heartRate
        ]
        var types = Set<HKObjectType>()
        for identifier in identifiers {
            if let type = HKObjectType.quantityType(forIdentifier: identifier) {
                types.insert(type)
            }
        }
        types.insert(HKObjectType.workoutType())
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        return types
    }

    @objc public func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc public func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device.")
            return
        }
        store.requestAuthorization(toShare: [], read: readTypes) { success, error in
            DispatchQueue.main.async {
                if let error {
                    call.reject("Apple Health permission could not be requested.", nil, error)
                } else {
                    call.resolve(["authorized": success])
                }
            }
        }
    }

    @objc public func readRecent(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device.")
            return
        }

        let requestedDays = call.getInt("days") ?? 90
        let days = max(7, min(requestedDays, 180))
        let calendar = Calendar.autoupdatingCurrent
        let end = Date()
        let start = calendar.date(byAdding: .day, value: -days, to: end) ?? end.addingTimeInterval(-Double(days) * 86_400)

        readWorkouts(from: start, to: end) { [weak self] workoutResult in
            guard let self else { return }
            switch workoutResult {
            case .failure(let error):
                self.reject(call, error)
            case .success(let workouts):
                self.readDaily(.hrv, from: start, to: end) { hrvResult in
                    switch hrvResult {
                    case .failure(let error): self.reject(call, error)
                    case .success(let hrv):
                        self.readDaily(.restingHeartRate, from: start, to: end) { restingResult in
                            switch restingResult {
                            case .failure(let error): self.reject(call, error)
                            case .success(let resting):
                                self.readDaily(.steps, from: start, to: end) { stepsResult in
                                    switch stepsResult {
                                    case .failure(let error): self.reject(call, error)
                                    case .success(let steps):
                                        self.readSleep(from: start, to: end) { sleepResult in
                                            switch sleepResult {
                                            case .failure(let error): self.reject(call, error)
                                            case .success(let sleep):
                                                let daily = self.mergeDaily(
                                                    hrv: hrv,
                                                    restingHeartRate: resting,
                                                    steps: steps,
                                                    sleep: sleep
                                                )
                                                DispatchQueue.main.async {
                                                    call.resolve([
                                                        "version": 1,
                                                        "provider": "Apple Health",
                                                        "importedAt": self.iso.string(from: Date()),
                                                        "workouts": workouts,
                                                        "daily": daily
                                                    ])
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private enum DailyMetric {
        case hrv, restingHeartRate, steps

        var identifier: HKQuantityTypeIdentifier {
            switch self {
            case .hrv: return .heartRateVariabilitySDNN
            case .restingHeartRate: return .restingHeartRate
            case .steps: return .stepCount
            }
        }

        var options: HKStatisticsOptions {
            self == .steps ? .cumulativeSum : .discreteAverage
        }

        var unit: HKUnit {
            switch self {
            case .hrv: return .secondUnit(with: .milli)
            case .restingHeartRate: return HKUnit.count().unitDivided(by: .minute())
            case .steps: return .count()
            }
        }
    }

    private func readDaily(
        _ metric: DailyMetric,
        from start: Date,
        to end: Date,
        completion: @escaping (Result<[String: Double], Error>) -> Void
    ) {
        guard let type = HKObjectType.quantityType(forIdentifier: metric.identifier) else {
            completion(.success([:]))
            return
        }
        let calendar = Calendar.autoupdatingCurrent
        let anchor = calendar.startOfDay(for: start)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: metric.options,
            anchorDate: anchor,
            intervalComponents: DateComponents(day: 1)
        )
        query.initialResultsHandler = { [weak self] _, collection, error in
            guard let self else { return }
            if let error {
                completion(.failure(error))
                return
            }
            var values: [String: Double] = [:]
            collection?.enumerateStatistics(from: start, to: end) { statistics, _ in
                let quantity = metric == .steps
                    ? statistics.sumQuantity()
                    : statistics.averageQuantity()
                if let quantity {
                    values[self.dayKey(statistics.startDate)] = quantity.doubleValue(for: metric.unit)
                }
            }
            completion(.success(values))
        }
        store.execute(query)
    }

    private func readWorkouts(
        from start: Date,
        to end: Date,
        completion: @escaping (Result<[[String: Any]], Error>) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [sort]
        ) { [weak self] _, samples, error in
            guard let self else { return }
            if let error {
                completion(.failure(error))
                return
            }
            let workouts = (samples as? [HKWorkout] ?? []).map(self.workoutPayload)
            completion(.success(workouts))
        }
        store.execute(query)
    }

    private func workoutPayload(_ workout: HKWorkout) -> [String: Any] {
        let mapped = workoutKind(workout.workoutActivityType)
        var result: [String: Any] = [
            "id": workout.uuid.uuidString,
            "type": mapped.type,
            "title": mapped.title,
            "start": iso.string(from: workout.startDate),
            "durationMin": workout.duration / 60,
            "source": workout.sourceRevision.source.name
        ]

        let distanceIdentifier: HKQuantityTypeIdentifier = workout.workoutActivityType == .cycling
            ? .distanceCycling
            : .distanceWalkingRunning
        if #available(iOS 16.0, *) {
            if let distanceType = HKObjectType.quantityType(forIdentifier: distanceIdentifier),
               let distance = workout.statistics(for: distanceType)?.sumQuantity() {
                result["distanceKm"] = distance.doubleValue(for: .meterUnit(with: .kilo))
            }
            if let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate),
               let heartRate = workout.statistics(for: heartRateType)?.averageQuantity() {
                result["heartRate"] = heartRate.doubleValue(
                    for: HKUnit.count().unitDivided(by: .minute())
                )
            }
        } else if let distance = workout.totalDistance {
            result["distanceKm"] = distance.doubleValue(for: .meterUnit(with: .kilo))
        }
        return result
    }

    private func workoutKind(_ activity: HKWorkoutActivityType) -> (type: String, title: String) {
        switch activity {
        case .running:
            return ("running", "Run")
        case .traditionalStrengthTraining, .functionalStrengthTraining, .crossTraining:
            return ("strength", "Strength training")
        case .walking:
            return ("recovery", "Walk")
        case .yoga, .mindAndBody, .flexibility:
            return ("recovery", "Mobility & recovery")
        case .cycling:
            return ("cycling", "Cycling")
        default:
            return ("other", "Workout")
        }
    }

    private func readSleep(
        from start: Date,
        to end: Date,
        completion: @escaping (Result<[String: Double], Error>) -> Void
    ) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(.success([:]))
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [sort]
        ) { [weak self] _, samples, error in
            guard let self else { return }
            if let error {
                completion(.failure(error))
                return
            }
            let asleepValues = Set([1, 3, 4, 5])
            let sleepSamples = (samples as? [HKCategorySample] ?? [])
                .filter { asleepValues.contains($0.value) }
            var grouped: [String: [(Date, Date)]] = [:]
            for sample in sleepSamples {
                grouped[self.dayKey(sample.endDate), default: []].append((sample.startDate, sample.endDate))
            }
            var result: [String: Double] = [:]
            for (day, intervals) in grouped {
                let sorted = intervals.sorted { $0.0 < $1.0 }
                var merged: [(Date, Date)] = []
                for interval in sorted {
                    if let last = merged.last, interval.0 <= last.1 {
                        merged[merged.count - 1].1 = max(last.1, interval.1)
                    } else {
                        merged.append(interval)
                    }
                }
                result[day] = merged.reduce(0) { $0 + $1.1.timeIntervalSince($1.0) } / 3_600
            }
            completion(.success(result))
        }
        store.execute(query)
    }

    private func mergeDaily(
        hrv: [String: Double],
        restingHeartRate: [String: Double],
        steps: [String: Double],
        sleep: [String: Double]
    ) -> [[String: Any]] {
        let dates = Set(hrv.keys)
            .union(restingHeartRate.keys)
            .union(steps.keys)
            .union(sleep.keys)
        return dates.sorted(by: >).map { date in
            var row: [String: Any] = ["date": date]
            if let value = hrv[date] { row["hrvMs"] = value }
            if let value = restingHeartRate[date] { row["restingHr"] = value }
            if let value = steps[date] { row["steps"] = value }
            if let value = sleep[date] { row["sleepHours"] = value }
            return row
        }
    }

    private func dayKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = .autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func reject(_ call: CAPPluginCall, _ error: Error) {
        DispatchQueue.main.async {
            call.reject("Apple Health data could not be read.", nil, error)
        }
    }
}
