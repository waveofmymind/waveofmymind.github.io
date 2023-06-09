---
title: "Effective Kotlin Item 3. 최대한 플랫폼 타입을 사용하지 말라"
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

