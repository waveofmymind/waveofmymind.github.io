---
title: "코틀린스럽게 작성해보기 with 컬렉션 함수"
date: 2023-06-09 00:12:27 +0900
aliases: 
tags: [Kotlin,Clean Code,Collection Function]
categories: [Trouble Shooting]
---

![코틀린](/assets/img/kotlin.webp)

NEXTSTEP 에서 진행하는 **TDD, 클린코드 with Kotlin 6기**에 참여하면서 미션에 대한 피드백 바탕으로 코틀린스럽게 작성해보는 경험을 공유하고자합니다.

이번 미션은 첫 주차이기때문에 요구사항 자체는 간단했습니다 (아마도?)

## AS-IS

2단계는 문자열 계산기를 구현하는 미션이였는데요.

저는 계산을 하는 함수 로직을 다음과 같이 작성했습니다.

```kotlin
fun calculate(formula: Formula): Double {

	val expression = formula.expression
    var result = expression[0].toDouble()

    for (i in 1 until expression.size step 2) {
                val operation = operations[expression[i]]
                    ?: throw IllegalArgumentException("유효하지 않은 연산자입니다.")
                result = operation(result, expression[i + 1].toDouble())
                }
            return result
        }
```

자바 코드에 익숙하다보니 코틀린에서 지원하는 함수는 생각하지 못하고 for문을 이용한 반복문으로 구현을 했습니다.

![피드백1](/assets/img/2023-06-09-kotlin-with-scopefunction/feedback1.webp)


![피드백2](/assets/img/2023-06-09-kotlin-with-scopefunction/feedback2.webp)


![피드백3](/assets/img/2023-06-09-kotlin-with-scopefunction/feedback3.webp)

그 결과, 당연히 수많은 피드백을 받게 되었습니다(?)

그래서 저는 코틀린이 지원하는 다양한 컬렉션 함수를 사용하면 코틀린스럽게 구현이 가능하다는 피드백을 받고 적용하기 위해, 개념부터 찾아보게 되었습니다.

더 많은 컬렉션 함수가 있지만, 제가 이번에 리팩토링할 때 사용했던 함수들만 중점적으로 설명할 예정이니 더 많은 컬렉션 함수는 [여기](https://kotlinlang.org/docs/collection-operations.html#write-operations)를 참고해주세요.

## Colletion function

### drop, windowed

drop()은 앞에서부터 인자로 주어진 수만큼 제거한 String을 반환합니다.

substring()과 같은 역할이라고 할 수 있습니다.

리스트에서 사용하면 아래와 같이 사용이 가능합니다.
```kotlin
val numbers = listOf("one", "two", "three", "four", "five", "six")

println(numbers.drop(1))

// output:
// [two, three, four, five, six]
```

windowed는 인자로 size, step, partialWindows를 받을 수 있는데,

각 윈도우를 size 크기에 step만큼 전진한다는 의미입니다.

partialWindows는 윈도우를 쪼갤 때 마지막 윈도우가 size보다 작을 경우 해당 윈도우를 그대로 유지할지 여부를 정하는 Boolean 값이며, 디폴트는 false입니다.

```kotlin
val range = 0..10

val temp = range.windowed(3, 3)
val temp2 = range.windowed(3,3, true)
println(temp) // [[0,1,2],[3,4,5],[6,7,8]]
println(temp2) // [[0,1,2],[3,4,5],[6,7,8],[9,10]]
```

### take, first

first()는 말 그대로 첫번째 인자를 가져올 수 있습니다.

```kotlin
(0..10).toList().first() // 0
```
take()는 인자로 받은 Int 값만큼 앞에서 취해서 리스트를 새로 생성합니다.

```kotlin
(0..10).toList().take(3) // [0,1,2]
```

### fold

```kotlin
inline fun <T, R> Iterable<T>.fold(
    initial: R,
    operation: (R, T) -> R
): R
```

fold는 누적합을 구하는 함수로 인자로 주어진 값을 초기값으로 하고 더해나갑니다.

```kotlin
val numbers = (1..10).toList()

val sum = numbers.fold(100) {total, num -> 
	totla + num
	}
print(sum) // 155
```

초기값을 인자로 넘긴 100부터 시작해서 마지막엔 total 값을 반환하게 됩니다.

## TO-BE

즉 위에서 피드백을 받아 리팩토링한 메서드는 다음과 같습니다.

```kotlin
fun calculate(input: String?): Double {
            val formula = Formula(input)
            val expression = formula.expression
            val first = expression.first().toDouble()

            return expression.drop(1)
                .windowed(2, 2)
                .fold(first) { result, (operation, number) ->
                    val op = operations[operation] ?: throw IllegalArgumentException("유효하지 않은 연산자입니다.")
                    op(result, number.toDouble())
                }
        }
```

수식의 첫번째 값을 받아올 때 first(),

초기값을 제외하고(drop) [연산자, 다음 계산할 수]로 새로운 리스트를 생성해서(windowed),

fold(first)로 위에서 first() 했던 변수를 초기값으로 누적 합을 구해나간 뒤, 최종적으로 누적한 값을 반환합니다.

처음에는 람다도 섞여있고, 생각보다 메서드를 많이 사용하게 되어 혼잡하다는 느낌을 받았지만,

하나씩 어떤 로직을 가지고 있는지 학습한 뒤 리팩토링을 해보니 코드가 더 직관적으로 읽히는 것 같습니다.

코틀린에서는 많은 컬렉션 함수를 지원하고 있기 때문에, 앞으로는 기능을 구현할 때 코틀린에서 지원하는 메서드가 있을지 찾아보는 것도 좋을 것 같습니다.






