---
title: "Effective Kotlin - Item 3. 최대한 플랫폼 타입을 사용하지 말라"
date: 2023-06-09 15:16:00 +0900
aliases: 
tags: [Kotlin]
categories: [Kotlin]
---

![Kotlin](/assets/img/kotlin.webp)

자바에서 자주 볼 수 있었던 NullPointException은 코틀린의 null-safety 메커니즘으로 인해 거의 찾아보기 힘들지만, 자바와 코틀린을 연결해서 사용할 때는 이러한 예외가 발생할 수 있다.

`@NotNull` 혹은 `@Nullable` 이 붙은 경우라면 String, String?으로 추정 및 변경이 가능하지만 **어노테이션이 없다면 모든 것을 nullable로 가정**하고 다루어야 한다.

nullable과 가장 많은 문제가 되는 부분은 자바의 제네릭 타입이다.
```kotlin
public class UserRepo {
	public List<User> getUsers() {
		// **
	}
}

val users: List<User> = UserRepo().users!!.filterNotNull()
```
위와 같이 리스트 자체가 null인지, 내부 데이터가 널인지 체크해야하며 리스트가 아닌 map, filterNotNull 등의 메서드를 제공하지 않는 다른 제네릭 타입이면 null 확인 자체가 복잡한 일이 된다.

## 플랫폼 타입

위와 같은 문제 때문에 코틀린은 자바 등 다른 프로그래밍 언어에서 넘어온 타입을 특수하게 다루며 이를 **플랫폼 타입(platform type)**이라고 부른다. 플랫폼 타입은 String! 처럼 뒤에 ! 기호를 붙여서 표기한다. (직접적으로 코드에 나타나지는 않음)
```kotlin
val repo = UserRepo()
val user1 = repo.user // user1: User!
val user2: User = repo.user // user2: User
val user3: User? = repo.user // user3: User?
```
위와 같이 사용이 가능하기 때문에 null 체크 등의 복잡한 문제는 사라진다.

하지만 여전히 null일 가능성이 존재하므로 플랫폼 타입을 사용할 떄는 항상 주의를 기울여야한다.

가급적 자바를 코틀린과 함께 사용할 때 자바 코드에 아래와 같이 어노테이션(NotNull, Nullable)을 붙여 사용하자.
```java
public @NotNull User getUser() {
}
```
현재 다음과 같은 어노테이션이 지원되고 있음

- org.jetbrains.annotations @Nullable @NotNull
- JSR-305, javax.annotation @Nullable @Nonnull, @CheckForNull
- JavaX, javax.annotation @Nullable @Nonnull, @CheckForNull 
- 기타 등등

JSR-305의 `@ParametersAreNonnullbyDefault` 를 사용하면 자바에서도 디폴트로 파라미터가 널이 아님을 보장할 수 있다.
```kotlin
public class JavaClass {
    public String getValue() {
        return null;
    }
}

fun statedType() {
    // NPE
    val value: String = JavaClass().value
    
    println(value.length)
}

fun platformType() {
    val value = JavaClass().value

    // NPE
    println(value.length)
}
```
위 케이스에서 statedType은 값을 가져오는 경우에 즉시 NPE가 발생하지만 platformType은 length를 호출할 때 NPE가 발생한다.

이러한 변수를 한 두번 안전하게 사용하더라도 이후에 다른 사람이 사용할 때 NPE가 발생하지 않은거란 보장이 없음 때문에 이와 같은 **플랫폼 타입은 최대한 빨리 제거**하는 것이 좋다.
```kotlin
interface UserRepo {
    fun getUserName() = JavaClass().value
}

class RepoImpl: UserRepo {
    override fun getUserName(): String? {
        return null
    }
}

fun main() {
    val repo: UserRepo = RepoImpl()
    val text: String = repo.getUserName() // Runtime에 NPE
}
```
위의 예제에서도 디폴트 메소드가 inferred type(추론된 타입)이며 플랫폼 타입으로 지정되기 때문에 사용하는 사람이 nullable이 아닐거라고 받아들이면 런타임에 NPE가 발생할 수 있다.

## 정리

- 다른 프로그래밍 언어에서 와서 nullable 여부를 알 수 없는 값을 플랫폼 타입이라고 한다.
- 사용하는 부분 뿐만 아니라 활용하는 곳 까지 영향을 줄 수 있는 위험한 코드이며 빨리 해당 코드를 제거하는게 좋다.

## 레퍼런스

- 이펙티브 코틀린 - 프로그래밍 인사이트, 마르친 모스칼라 지음, 윤인성 옮김

