---
title: "Effective Kotlin Item 1. 가변성을 제한하라"
date: 2023-06-08 15:09:00 +0900
aliases: 
tags: [Kotlin]
categories: [Kotlin]
---

## 코틀린에서 가변성 제한하기
---
코틀린에서 가변성을 제한하기 위해 굉장히 많은 방법을 활용할 수 있지만 많이 사용되고 중요한 방법은 아래와 같다.

- 읽기 전용 프로퍼티(val)
- 가변 컬렉션과 읽기 전용 컬렉션 구분
- 데이터 클래스의 copy

### 읽기 전용 프로퍼티(val)

코틀린에서는 val 키워드로 읽기 전용 프로퍼티를 만들 수 있다.
- 읽기 전용 프로퍼티로 정의해도 Mutable한 데이터를 담고 있다면 내부적으로 변경이 가능하다.

### 가변 컬렉션과 읽기 전용 컬렉션 구분하기

아래와 같은 컬렉션 다운 캐스팅 금지

```java
val list = listOf(1,2,3)

if (list is MutableList) {
    list.add(4)
}
```

JVM 기준 Arrays.ArrayList에는 add가 구현되어 있지 않아 UnsupportedOperationException이 발생한다.

읽기 전용에서 가변으로 변경하려면 아래와 같은 toMutableList를 활용한다.

```java
val list = listOf(1,2,3)
val mutable = list.toMutableList()
```

### 데이터 클래스의 copy

Immutable 객체를 사용하면 아래와 같은 장점이 있다.

- 한번 정의된 상태가 유지되므로 코드를 이해하기 쉽다.
- Immutable 객체는 공유시에도 충돌이 발생하지 않아 병렬 처리를 안전하게 할 수 있다.
- Immutable 객체에 대한 참조는 변경되지 않으므로, 쉽게 캐시할 수 있다.
- Immutable 객체의 방어적 복사본을 만들 필요가 없다. 또한 깊은 복사를 따로 할 필요가 없다.
- Immutable 객체는 다른 객체를 만들때 활용하기 좋으며 실행을 더 쉽게 예측할 수 있다.
- Immutable 객체는 Set 혹은 Map의 키로 활용할 수 있다. (Mutable은 요소에 수정이 일어나면 해시 테이블 내부에서 요소를 찾을 수 없어 활용할 수 없음)

Int와 같이 내부적으로 plus, minus와 같이 불변한 Int를 리턴하는 메소드를 만들어 불변을 유지할 수 있다.

> 매번 모든 프로퍼티 대상으로 plus, minus와 같은 함수를 만드는 것은 번거로우니 data class 및 copy 메소드를 활용하자

## 다른 종류의 변경 가능 지점(mutating point)
---
변경 가능한 리스트를 만들 때 아래와 같은 두가지 선택지가 존재한다.

- val + MutableList
```java
val list1: MutableList<Int> = mutableListOf()
var + ImmutableList
var list2: List<Int> = listOf()
```

두 가지 모두 변경은 가능하지만 내부적인 동작이 다르다.

```java
list1 += 1 // list1.plusAssign(1)
list2 += 1 // list2.plus(1)
```

첫번째 코드는 멀티스레드 처리 시 내부의 동기화 여부를 알 수 없어 위험하며 두번째 코드가 멀티스레드 안정성이 더 좋다. (하지만 잘못 만들면 일부 요소의 손실 가능)

mutable 프로퍼티를 사용하면 사용자 정의 setter(또는 이를 사용하는 델리게이트)를 활용해 변경을 추적할 수 있음
```java
var names by Delegates.observable(listOf<String>()) { _, old, new -> 
    println("Names chanaged from $old to $new")
}
```
MutableCollection 대신 mutable 프로퍼티인 var를 활용하는게 객체 변경을 더 제어하기가 쉽다.

최악의 방법은 프로퍼티와 컬렉션 모두 Mutable로 만드는 것

```java
var list = mutableListOf<Int>()
list += 1 // 모호성이 발생해 해당 연산자 사용 불가능
```
변경 가능 지점 노출하지 말기
Mutable 객체가 외부에 노출되는 경우 수정이 발생할 수 있으니 위험하다.

리턴되는 mutable 객체 복제해 반환하는 방어적 복제(defensive copying) 사용
```java
class UserHolder {
   private val user: MutableUser()
​
   fun get(): MutableUser {
       return user.copy()
   }
}
```

## 정리
- var 보다는 val 사용
- mutable 프로퍼티보다는 immutable 프로퍼티 사용
- mutable 객체와 클래스 보다는 immutable 객체와 클래스 사용
- 변경이 필요한 대상이 있다면 immutable data class로 만들고 copy 활용
- 컬렉션에 상태를 저장해야 한다면, mutable 보다는 immutable 컬렉션 사용
- 변이 지점을 적절하게 설게하고 불필요한 변이 지점을 만들지 않는게 좋다.
- mutable 객체의 외부 노출은 피하자.
- 효율성 때문에 immutable 보다 mutable을 다루는게 좋은 경우도 있다.

## 레퍼런스

이펙티브 코틀린 - 프로그래밍 인사이트, 마르친 모스칼라 지음, 윤인성 옮김

