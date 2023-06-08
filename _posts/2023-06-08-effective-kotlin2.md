---
title: "Effective Kotlin Item 2. 변수의 스코프를 최소화하라"
date: 2023-06-08 15:15:00 +0900
aliases: 
tags: [Kotlin]
categories: [Kotlin]
---

상태 정의시 변수와 프로퍼티의 스포크를 최소화하는 것이 좋다.
- 프로퍼티보다 지역 변수를 사용한다.
- 최대한 좁은 스코프를 갖도록 변수를 사용한다. 예를 들어 반복문 내부에서만 사용되면 변수를 반복문 내부에 작성하는 것이 좋다.

변수는 읽기 전용 여부와 상관 없이 if, when, try-catch, elvis operator(?:) 등을 활용해 변수를 정의할 때 초기화되는 것이 좋다.

```java
fun updateWeather(degrees: Int) {
	val (description, color) = when {
		degrees < 5 -> "cold" to Color.BLUE
		else -> "hot" to Color.RED
	}
}
```
여러 프로퍼티를 한꺼번에 설정해야 하는 경우, 위처럼 destructuring declaration을 활용한다.

## 캡처링
---
에라토스테네스의 체 구현시 아래와 같은 코드를 작성할 수 있다.
```java
val primes: Sequence<Int> = sequence {
	var numbers = generateSequence(2) { it + 1 }

	while (true) {
		val prime = numbers.first()
		yield(prime)
		numbers = numbers.drop(1)
			.filter { it % prime != 0 }
	}
}

println(primes.take(10).toList())
// [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
```
위 코드를 아래와 같이 최적화하려고 시도하는 경우 문제가 발생한다.
```java
val primes: Sequence<Int> = sequence {
    var numbers = generateSequence(2) { it + 1 }

    // while 스코프 바깥에 var로 정의
    var prime: Int
    while (true) {
        prime = numbers.first()
        yield(prime)
        numbers = numbers.drop(1)
            .filter { it % prime != 0 }
    }
}

println(primes.take(10).toList())
// [2, 3, 5, 6, 7, 8, 9, 10, 11, 12]
```
위와 같은 문제가 발생할 수 있으므로 가변성을 피하고 스코프 범위를 좁게 만들어 이런 문제를 간단하게 피해갈 수 있다.

Sequence를 많이 사용해보지 않아 조금 헷갈렸는데, var를 사용할 때 prime 값이 ObjectRef로 캡처링되면서 지연 필터링이 우리가 의도한 대로 동작하지 않는 것 같습니다.

## 정리
---
- 변수의 스코프는 좁게 만들어서 활용하자.
- var 보다는 val을 사용하는 것이 좋다.
- 람다에서 변수를 캡처한다는 것을 기억하자.

## Reference
---
이펙티브 코틀린 - 프로그래밍 인사이트, 마르친 모스칼라 지음, 윤인성 옮김