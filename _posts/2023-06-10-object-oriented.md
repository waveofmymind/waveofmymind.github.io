---
title: "객체 지향적으로 리팩토링해보기"
date: 2023-06-10 09:29:00 +0900
aliases: 
tags: [Kotlin]
categories: [Kotlin]
---

![Kotlin](/assets/img/kotlin.webp)

NEXTSTEP에서 진행하는 **TDD, 클린코드 with Kotlin 6기**에 참여하면서 미션에 대한 피드백 바탕으로 리팩토링을 하던 과정 중, 발생한 문제점을 해결한 내용을 공유하고자합니다.

## AS-IS

저는 자동차 경주를 구현하던 중 자동차가 움직이는 것에 대해 단위 테스트를 작성해야했습니다.

문제가 된 부분은 자동차가 움직이는 조건이였는데요.

현재 자동차를 움직이는 조건은 각 시퀀스당 0부터 9까지의 랜덤한 수를 뽑아 4 이상일 경우에 한 칸을 움직이게 됩니다.

즉, 아래와 같이 구현되어 있었습니다.

```kotlin
class Car {
	private var position = 0

	fun move(moveFlag : Boolean) {
		if (moveFlag) {
			position++
		}
	} 
}

class Race(
    private val numberOfCars: Int,
    private val numberOfAttempts: Int,
    private val carFactory: CarFactory
) {
    private val cars: List<Car> = carFactory.createCars(numberOfCars)

    fun startRace(): List<List<String>> {
        val raceResults = mutableListOf<List<String>>()

        for (i in 1..numberOfAttempts) {
        	cars.forEach { car ->
                car.move(canMove())
            }
            raceResults.add(cars.map { it.getVisualPosition() })
        }
        return raceResults
    }

    fun canMove(): Boolean {
        return (0..9).random() >= 4
    }
}
```
아직 날것의 코드이지만 불편하더라도 참아주세요(?)

즉, random() 메서드가 사용되는 canMove() 메서드는 랜덤한 요소에 의존하고 있기 때문에 항상 통과하는 테스트를 작성할 수 없었습니다.

메서드 내부에 또다른 의존성이 숨겨져있는 문제가 있었던 것입니다.

## 랜덤한 요소에 의존하지 않도록 변경하기

저는 우선 차량이 올바른 조건 하에서 잘 움직이는가?에 대한 테스트를 하려는 것이기 때문에, 차량을 움직이는 조건이 랜덤한 요소에 직접적으로 의존하지 않으면 될 것이라고 생각했습니다.

그렇게 되면 테스트 코드에서도 항상 움직이는 조건, 움직이지 않는 조건에서 테스트를 해볼 수 있기 때문입니다.

저는 그래서 MoveGenerator라는 인터페이스를 따로 생성하고, 인터페이스를 상속하는 RandomMoveGenerator라는 클래스를 생성해서 canMove() 메서드를 구현했습니다.
```kotlin
interface MoveGenerator {
    fun canMove() : Boolean
}

class RandomMoveGenerator {
    fun canMove() : Boolean {
        return (0..9).random() >= 4
    }
}
```

그리고, Race 클래스에 다음과 같이 프로퍼티로 추가했습니다.

```kotlin
class Race(
    private val numberOfCars: Int,
    private val numberOfAttempts: Int,
    private val moveGenerator: MoveGenerator,
    private val carFactory: CarFactory
) {
    private val cars: List<Car> = carFactory.createCars(numberOfCars)

    fun startRace(): List<List<String>> {
        val raceResults = mutableListOf<List<String>>()

        for (i in 1..numberOfAttempts) {
            cars.forEach { car ->
                car.move(moveGenerator.canMove())
            }
            raceResults.add(cars.map { it.getVisualPosition() })
        }
        return raceResults
    }
}
```

이제 랜덤한 조건에 의해 움직이는 것을 MoveGenerator라는 인터페이스에서 담당하고 있기 때문에 테스트를 작성하는 것이 가능해졌습니다

```kotlin
class RaceTest : BehaviorSpec({

    val alwaysMoveGenerator = object : MoveGenerator {
        override fun canMove(): Boolean = true
    }
    val neverMoveGenerator = object : MoveGenerator {
        override fun canMove(): Boolean = false
    }

    Given("alwaysMoveGenerator 가 주입되었을 때") {
        val carFactory = DefaultCarFactory()
        When("경주를 시작하면") {
            val race = Race(3, 2, alwaysMoveGenerator, carFactory)
            val results = race.startRace()
            Then("모든 자동차는 매 시도마다 위치가 증가한다.") {
                results shouldBe listOf(listOf("-", "-", "-"), listOf("--", "--", "--"))
            }
        }
    }

    Given("neverMoveGenerator 가 주입되었을 때") {
        val carFactory = DefaultCarFactory()
        When("경주를 시작하면") {
            val race = Race(3, 2, neverMoveGenerator, carFactory)
            val results = race.startRace()
            Then("모든 자동차의 위치가 변하지 않는다.") {
                results shouldBe listOf(listOf("", "", ""), listOf("", "", ""))
            }
        }
    }
})
```

## 객체 지향적으로 설계하기

그러나 위에서부터 코드를 보시던 분들은 아시겠지만, 매우 스파게티 코드입니다.
구현하던 당시의 저는 생각하지 못했던 많은 문제들을 내포하고있었기 떄문입니다.

그래서 다음과 같은 피드백을 받았습니다.
![피드백1](/assets/img/2023-06-10-random-test/feedback1.webp)

우선 자동차의 경주만을 담당해야할 Race 클래스에서 MoveGenerator를 알고 메시지를 보낸다는 점이였습니다.

경주 클래스가 자동차에게 메시지를 보내서 자동차 자체가 능동적으로 역할을 수행하도록 해야하지만, 지금은 차량의 이동조건인 MoveGenerator를 Race 클래스가 알고, 오히려 Car 클래스가 모르고 있었습니다.

Car 클래스는 자신이 왜 움직이는지도 알지 못한채 수동적으로 움직이게 되었던 것이죠.


그래서 저는 Car 클래스가 가지도록 코드를 변경했습니다.
Car 클래스가 MoveGenerator를 프로퍼티로 가지는 것이 더 적절하다고 판단했습니다.
차와 모터의 관계로 보시면 될 것 같습니다.

```kotlin
class Car(
    private val moveGenerator: MoveGenerator
) {
    private var position: Int = 0

    fun move() {
        if (moveGenerator.canMove()) position++
    }

    fun getVisualPosition(): String = "-".repeat(position)
}
```

그리고 위에서 진행했던 RaceTest의 MoveGenerator에 의한 테스트도 CarTest에서 하도록 수정했습니다.

```kotlin
class CarTest : BehaviorSpec({

    val alwaysMoveGenerator = object : MoveGenerator {
        override fun canMove(): Boolean = true
    }
    val neverMoveGenerator = object : MoveGenerator {
        override fun canMove(): Boolean = false
    }

    Given("Car 클래스가 항상 움직이지 않는 조건일 때") {
        When("움직이면") {
            val car = Car("test", neverMoveGenerator)
            car.move()

            Then("위치는 0이어야 한다") {
                car.getVisualPosition() shouldBe ""
            }
        }
    }

    Given("Car 클래스가 항상 움직이는 조건일 때") {
        When("움직이면") {
            val car = Car("test", alwaysMoveGenerator)
            car.move()

            Then("위치는 1이어야 한다") {
                car.getVisualPosition() shouldBe "-"
            }
        }
    }
})
```

이제 좀 객체지향적인 코드가 되지 않았나요?
사실 좀 더 수정할 내용이 많습니다.
Car 클래스에서 시각적 위치를 나타내는 getVisualPosition()나, Race 클래스에서 CarFactory를 사용해서 차를 생성하는 등의 문제가 있습니다.

문제를 해결하는 과정은 글이 너무 길어지므로, 제가 구현했던 결과를 보여드리겠습니다.

## TO-BE

객체 지향적으로 설계하는 것에 대해 고민해가면서 리팩토링한 결과,
Race 클래스와 Car 클래스는 다음과 같이 변경할 수 있었습니다.

```kotlin
class Race(
    private val cars: List<Car>,
    private val numberOfAttempts: Int
) {
    fun startRace(): RaceSummary {
        val raceResults = mutableListOf<RaceResult>()

        repeat(numberOfAttempts) {
            raceResults.add(runSingleAttempt())
        }
        return RaceSummary(raceResults)
    }
    private fun runSingleAttempt(): RaceResult {
        cars.forEach { car ->
            car.move()
        }
        return RaceResult(cars.map { it.getCurrentState() })
    }
}

class Car(
    private val name: String,
    private val moveGenerator: MoveGenerator
) {
    private var position: Int = 0

    init {
        require(name.length <= 5) { "자동차 이름은 5자를 초과할 수 없습니다." }
    }

    fun move() {
        if (moveGenerator.canMove()) position++
    }
    fun getCurrentState(): CarState {
        return CarState(name, getVisualPosition())
    }
}
```
그리고, 시각적 위치를 나타내는 getVisualPosition()은 결과창을 나타내는 ResultView() 클래스에게 위임했습니다.

```kotlin
class ResultView : OutputHandler {
    
    //...

    private fun getVisualPosition(position: Int): String {
        return "-".repeat(position)
    }

    //...
}
```

이제 객체들은 능동적으로 맡은 역할에 대해서만 책임을 다 할 수 있게 되었습니다.

객체 지향스럽게 설계하는 것에 대해 고민을 많이 하지 않았던 제가 봐도 변경된 코드가 훨씬 좋은 코드라는 것이 느껴집니다.(아마도..?)

근래에 좋은 코드라는 것이 무엇일까에 대해서 고민이 많았는데,

프로그램에 참여한지 1주차이지만 그동안 구현한 코드들이 부끄럽게 느껴질 정도로 저 자신이 많이 성장하고 있다는 것이 느껴지는 기회인 것 같습니다.

아직 많이 부족하지만 앞으로도 이러한 사고를 유지하며 남은 기간동안 더 성장할 수 있도록 노력해야겠습니다.



















