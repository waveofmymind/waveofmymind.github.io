---

title: "코루틴 내부 구조 톺아보기"
date: 2023-10-24 09:29:00 +0900
aliases: 
tags: [Coroutine,Kotlin,Kotlin Coroutine]
categories: [Kotlin]

---

코틀린 코루틴(Kotlin Coroutines, 2023)을 읽으며, 가장 중요하다고 생각되는 내부 구조에 대해 정리하는 글입니다.

> 서적에는 더 많은 유익한 정보가 있기 때문에 직접 읽어보시는 것을 권장드립니다.🙇‍♂️
{: .prompt-info}

## Continuation-Passing Style

**중단될 수 있다는 것**은 이전에 중단 되었던 **상태** 그대로 언제든 다시 시작할 수 있는데 의의가 있습니다.

코틀린에서의 코루틴은 Continuation-Passing Style을 택하여 함수의 마지막 인자로 Continuation 객체를 넘기고 있습니다.

```kotlin
suspend fun getArticle(articleId: Long): Article?

suspend fun updateArticle(command: UpdateArticleCommand)

suspend fun authenticate(userId: Long): Boolean
```
위와 같은 게시글을 조회하고, 업데이트하고, 작성자인지 확인하는 함수를 자바 코드로 디컴파일 해보면, 아래와 같아집니다.

```kotlin
fun getArticle(articleId: Long, continuation: Continuation<*>): Any?

fun updateArticle(command: UpdateArticleCommand, continuation: Continuation<*>): Any

fun authenticate(userId: Long, continuation: Continuation<*>): Any
```

특징은 다음과 같습니다.

1. 반환 타입이 Any 또는 Any?로 변한 것
2. 함수의 마지막 매개변수로 continuation이 추가된 것

1번을 먼저 살펴보면, 중단 함수는 중단된다는 케이스가 존재하기 때문에 함수를 실행시 지정한 반환 타입을 반환하지 않을 수도 있습니다. 중단되었기 때문입니다.

그렇기 때문에 코틀린에서는 중단시 COROUTINE_SUSPENDED