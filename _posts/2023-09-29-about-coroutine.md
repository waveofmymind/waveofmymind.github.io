---

title: "코루틴을 사용한 예외 방지와 비동기적 저장 구현기"
date: 2023-09-29 09:29:00 +0900
aliases: 
tags: [Kotlin,coroutine,Spring]
categories: [Spring]

---

레주마블 프로젝트를 진행하면서 생성된 면접 예상 질문을 다루는 로직에서 코루틴을 사용한 경험을 공유하고자합니다.

## **AS-IS**

레주마블 프로젝트는 사용자 이력서를 활용해서 OpenAi의 챗 GPT로부터 면접 예상 질문을 생성합니다.

생성된 예상 질문은 사용자에게 결과로 나타내어집니다.

이해하기 쉽게 간략한 코드로 나타내보자면,

```kotlin
fun generateInterviewQuestion(request: Request): Response {
  val result = openAiService.requestInterviewQuestion(request)
  return result
}
```

위처럼 openAiService 클래스에서 Open Feign으로 OpenAi API 요청을 하고, 생성된 결과를 응답하는 로직입니다.

이 로직에 생성된 결과를 DB에 저장하는 로직을 추가해야했습니다.(DB는 RDB, MySQL을 사용합니다.)



