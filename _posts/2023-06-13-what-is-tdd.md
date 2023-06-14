---
title: "TDD에 대해서 구체적으로 알아보기"
date: 2023-06-13 21:29:00 +0900
aliases: 
tags: [TDD,clean code,Kotlin]
categories: [Kotlin]
---

![kotlin](/assets/img/kotlin.webp)

NEXTSTEP에서 진행하는 **TDD, 클린 코드 with Kotlin 6기**에 참여하면서 2주차 수업을 듣고 TDD에 대해서 자세히 정리해본 글입니다.

## 이름

이름을 짓는 것은 중요하다.

6개월 뒤의 내가 이해할 수 있는 이름을 짓자.

```kotlin
fun move(randomNumber: Int) {
	if (randomNumber >= FORWARD_NUMBER) position++
}
```
위와 같은 코드에서 move 함수로 넘어오는 인자가 무작위 값인지 Car 클래스의 입장에서 알 필요가 없다.


## 리팩토링

실무에서 가장 중요한 능력은 **리팩터링**

그러나 실무에서는 서비스의 규모가 크기 때문에 함부로 리팩터링을 연습할 수 없다.

미션을 통해 리팩터링을 하는 연습을 하자.

## TDD

![tdd](/assets/img/2023-06-13-what-is-tdd/tdd.webp)

우선 테스트가 가능한 부분을 찾자. 작은 것이라도 좋다.

예제는 1주차에 진행했던 자동차 경주이다.

### 요구사항 분석

자동차 경주에 대한 요구사항 분석

**기능 요구사항**
- 각 자동차에 이름을 부여할 수 있다. 자동차 이름은 5자를 초과할 수 없다.
- 전진하는 자동차를 출력할 때 자동차 이름을 같이 출력한다.
- 자동차 이름은 쉼표(,)를 기준으로 구분한다.
- 자동차 경주 게임을 완료한 후 누가 우승했는지를 알려준다.
- 우승자는 한 명 이상일 수 있다. 

**기능 목록**

- [ ] 자동차는 이름과 위치를 가진다. -> Car
- [ ] 자동차의 초기 위치는 0이다. -> Car
- [ ] 자동차의 이름은 5글자를 넘길 수 없다. -> Car
- [ ] 자동차는 무작위 값이 4 이상일 경우 이동할 수 있다. -> Car
- [ ] 자동차는 무작위 값이 4 미만일 경우 정지한다. -> Car
- [ ] 자동차들을 경주시킨다. -> RacingGame
- [ ] 가장 멀리 간 자동차가 우승자다. -> Winner
- [ ] 우승자는 한 명 이상일 수 있다. -> Winner
- [ ] 자동차들의 이름은 쉼표(,)를 기준으로 구분한다. -> Cars

위처럼 기능 목록을 정하고, 도메인을 대략이나마 도출한다.

### RED

```kotlin
class CarTest {
	@Test
	fun `자동차는 이름과 위치를 가진다`() {
		val actual = Car("홍길동", 1)
		actual.name shouldBe "홍길동"
		actual.position shouldBe 1
	}
}
```

위와 같이 테스트 코드를 먼저 작성함으로써 Red 단계 과정을 거친다.

당연히 실행하는 테스트 코드이다.

### GREEN

파라미터 명이나 타입은 신경쓰지 말고 테스트 코드를 통과시키기 위한 코드만을 구현한다.

온갖 '죄악'인 셈이다.

```kotlin
class Car(s: String, i: Int) {
	val name: Any = "홍길동"
	val position: Any = 1
}

class CarTest {
	@Test
	fun `자동차는 이름과 위치를 가진다`() {
		val actual = Car("홍길동", 1)
		actual.name shouldBe "홍길동"
		actual.position shouldBe 1
	}
}
```

위처럼 Car를 구현하면 테스트 코드는 통과할 것이다.

### Refactor

위에서 대충 작성했던 클래스, Car 클래스의 필드를 고치거나, 타입을 맞춘다.

```kotlin
class Car(name: String, position: Int) {
	val name: String = "홍길동"
	val position: Int = 1
}

class CarTest {
	@Test
	fun `자동차는 이름과 위치를 가진다`() {
		val actual = Car("홍길동", 1)
		actual.name shouldBe "홍길동"
		actual.position shouldBe 1
	}
}
```

그러나 위 테스트는 통과하지만, 생성자가 의미 없는 등의 보이지 않은 문제점이 보인다.

심리적 불안함이다.

새로운 테스트 작성해보자.

```kotlin
class Car(name: String, position: Int) {
	val name: String = "홍길동"
	val position: Int = 1
}

class CarTest {

	//...

	@Test
	fun `자동차는 이름과 위치를 가진다2`() {
		val actual = Car("제이슨", 10)
		actual.name shouldBe "제이슨"
		actual.position shouldBe 1
	}
}
```

새로운 테스트에서는 이름과 위치를 변경했으나, 테스트를 통과하지 못했다.

생성자를 사용하지 않고 이름과 위치를 하드코딩 했기 때문이다.

```kotlin
class Car(name: String, position: Int) {
	val name: String = name
	val position: Int = position
}
```

위처럼 수정하면 두 테스트에 대해서 통과한다.

이제 리팩터링을 해보자.

```kotlin
class Car(val name: String, val position: Int)
```

위처럼 생성자를 사용해서 리팩터링을 수행했지만, 아직 끝나지 않았다.

테스트 코드에도 중복되는 점이 있기 떄문이다.

```kotlin
@CsvSource("홍길동,1","제이슨,10")
@ParameterizedTest
fun `자동차는 이름과 위치를 가진다`(name: String, position: String) {
	val actual = Car(name, position)
	actual.name shouldBe name
	actual.position shouldBe position
}
```

한 코드에 대해 인자를 여러개 테스트할 수 있는 ParameterizedTest를 사용해서 테스트 코드를 리팩토링했다.

위 테스트 코드가 통과함으로써, 두 테스트 메서드를 하나로 줄일 수 있었다.

### Kotest에서 ParameterizedTest 사용해보기

위 테스트 코드를 Kotest에서 해보자.

```
class CarKotest: StringSpec({

	"자동차는 이름과 위치를 가진다" {
		listOf(
			"홍길동" to 1,
			"제이슨" to 10
			).forAll { // (name, position) == it.first,it.second에 대한 구조분해
				val name = it.first
				val position = it.second
				val actual = Car(name,position)
				actual.name shouldBe name
				actual.position shouldBe position
			}
		}

})
```

forAll{}을 사용하면 ParameterizedTest와 같은 테스트를 할 수 있다.

이제 자동차는 이름과 위치를 가지는 기능을 구현했으니, 커밋하면 된다.


## One More Thing

- [ ] 자동차는 무작위 값이 4 이상일 경우 이동할 수 있다. -> Car

에 대한 TDD를 적용해보면,

```kotlin

@Test
fun `자동차는 무작위 값이 4 이상일 경우 이동할 수 있다.`() {
	val actual = Car("홍길동", 0)
	actual.move()
	actual.position shouldBe 1
}

class Car(val name: String, var position:Int = DEFAULT_POSITION) {

	//...

	fun move() {
		position++
	}

	//...
}
```

위와 같이 작성하면, 항상 통과하지만, 다음 요구사항에 대해 만족하지 못한다.

```kotlin
class Car(val name: String, var position:Int = DEFAULT_POSITION) {

	//...

	fun move() {
		if (Random.nextInt(10) >= 4) {
			position++
		}
	}

	//...
}
```

그러나 위처럼 작성하면 nextInt()의 인자로 들어가는 10이라는 값이 포함되는지 안되는지를 익숙하지 않으면 뜯어봐야한다.

코틀린의 range를 사용해보자.

```kotlin
fun move() {
		if ((1..9).random() >= 4) {
			position++
		}
	}
```

리팩토링은 했지만 또다른 문제가 있다.

**움직이는 함수가 랜덤한 값에 의존하고 있다는 것**

RacingMain -> RacingGame -> Car에서 Car는 어떤한 값에도 의존하면 안된다.

즉, 랜덤한 것은 테스트하기 어렵기 떄문에 이에 의존하는 Car도 테스트하기 어렵고, 상위의 RacingGame, RacingMain으로 테스트의 어려움이 전파된다.

**현재 구현 사항은 위 문제를 해결하지 못하기 때문에 모두 버린다.**

## 정리

TDD에 대해서 막연한 점이 많았다.

프로젝트를 진행할 때에도 요구사항을 구현하는데 정해진 시간이 있었기 때문에 실제 코드부터 구현하기 급급했기 때문이다.

2주차 교육 과정을 들으니 TDD에 대해서 더 해볼수 있다는 느낌이 들었다.


















