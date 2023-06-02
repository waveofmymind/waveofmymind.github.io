---
title: "여러 요청에 대해 비동기적으로 처리해보기"
date: 2023-06-02 10:56:00 +0900
aliases: 
tags: [async process]
categories: [Spring]
---


## **AS-IS**

전에 작성했던 챗 GPT의 API를 사용해서 이력서 내용에 개선할만한 점이 있는지에 대해 조언을 받는 서비스를 개발 중에 있습니다.

현재 사용자에 대한 요청 폼이 아래와 같이 되어있습니다.

![사용자 요청 폼](/assets/img/2023-06-02-async-processing/async-asis.webp)

검토 받길 원하는 내용을 하나만 받아 요청을 처리하고 있는 것입니다.

그러나 만약 검토를 받고싶은 분야가 여러가지일 경우 같은 행위를 여러번 수행해야하는 불편함이 생깁니다.

왜냐하면, 외부 API를 사용하는 것이기 때문에 한 요청에 3분정도 소요가 되기 때문입니다.

외부 API를 사용하는 것이기 때문에 응답 속도를 개선하는 방법은 없을 것이라고 생각했습니다.

그래서 저는 검토 받길 원하는 분야와 사용자의 이력서 내용을 여러개 받아서 검토 요청을 보내고자 했습니다.

그러나 기존에서 리스트로 요청을 하는 것은 아래와 같이 구현할 수 있었습니다.

```java
public ExpectedImproveResponse createdExpectedQuestionsAndAnswer(String job, String career, List<ResumeRequest> request) {

    ExpectedImproveResponse result = new ExpectedImproveResponse();

    for (ResumeRequest data : request) {
        List<ChatMessage> chatMessages = generateQuestionMessage(job, career, data.resumeType(), data.content());
        try {
            ChatCompletionResult chatCompletionResult = generate(chatMessages);
            String futureResult = chatCompletionResult.getChoices().get(0).getMessage().getContent();
            ExpectedImproveResponse content = objectMapper.readValue(futureResult, ExpectedImproveResponse.class);

            if(content.predictionResponse().size() != 0) {
                result.predictionResponse().addAll(content.predictionResponse());
            }
        } catch (JsonProcessingException e) {
            log.error(e.getMessage());
            throw new BusinessException(ErrorCode.JSON_PROCESSING_ERROR);
        }
    }
    return result;
}
```

for-each문으로 사용자의 요청 데이터를 하나씩 처리하기 때문에, 요청 시간이 요청 개수에 비례해서 증가하게 되었습니다.

한 요청당 3분이 걸릴 경우, 검토 받길 원하는 분야가 4개이면 3 * 4를 해서 최장 12분까지 걸릴 수 있는 것입니다.

서비스를 요청할때 10분이 넘어가는 것은 사용자에게 불편함을 초래할 수 있기때문에 저는 이에 대한 성능을 개선하고자 고민하게 되었습니다.

## **비동기적 처리**

만약, 리스트로 받은 사용자의 요청이 여러개라고 했을때, 이를 병렬적으로 처리한다면 모든 요청이 3분 정도면 완료될 것이라고 이론적으로 생각했습니다.

비동기적으로 처리하기 위해 기존의 학습하던 Spring Webflux를 사용하는게 좋지 않을까 라는 생각도 잠시 했지만, 팀 프로젝트이기 떄문에 저만의 필요성으로 Webflux로 기술 스택을 변경하는 것은 무리가 있어 보였고,

MVC를 사용하면서 비동기적으로 처리할 수 있는 방법은 뭐가 있을까에 대해 알아보던 중,

자바의 CompletableFuture을 접하게 되었습니다.

CompletableFuture는 자바 8부터 도입되어 기존의 Future라는 비동기적으로 작업을 수행하는 클래스의 단점을 보완해서 나온 클래스입니다.
 
또한, ExecutorService 객체를 따로 만들 필요가 없습니다.

CompletableFuture에 대해서는 [여기](https://mangkyu.tistory.com/263)에서 확인할 수 있습니다.

CompletableFuture가 지원하는 메서드는 runAsync()와 supplyAsync() 두가지가 있는데,
저는 반환값이 필요하므로 supplyAsync()를 사용하겠습니다.



우선 메서드에 CompletableFuture의 값을 넣어둘 배열을 만들어줍니다.

```java
List<CompletableFuture<ExpectedImproveResponse>> futures = new ArrayList<>();
```

그리고 for-each문으로 ResumeRequest 객체를 사용하기 위해 순회할 때,
CompletableFuture.supplyAsync() 메서드를 사용해줍니다.

```java
for (ResumeRequest data : resumeData) {
            CompletableFuture<WhatGeneratedImproveResponse> future = CompletableFuture.supplyAsync(() -> {
                List<ChatMessage> chatMessages = generateAdviceMessage(job, career, data.resumeType(), data.content());
                try {
                    ChatCompletionResult chatCompletionResult = generate(chatMessages);

                    String futureResult = chatCompletionResult.getChoices().get(0).getMessage().getContent();


                    return objectMapper.readValue(futureResult, ExpectedImproveResponse.class);
                } catch (JsonProcessingException e) {
                    log.error(e.getMessage());
                    throw new BusinessException(ErrorCode.JSON_PARSING_FAILED);
                }
            }, executorService);

            futures.add(future);
        }
        CompletableFuture<Void> allFutures = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]));

```

각 ResumeRequest에 대한 실행 과정은 아래와 같습니다.

1. 각 ResumeRequest data를 가지고 generateAdviceMessage를 호출하여 List<ChatMessage> chatMessages 를 생성합니다.
2. CompletableFuture.supplyAsync()를 사용해 비동기 작업을 시작합니다.
    - 먼저, generate 메서드를 호출하여 ChatCompletionResult를 생성합니다.
    - ChatCompletionResult에서 첫 번째 메시지의 내용(futureResult)을 가져옵니다.
    - futureResult를 ExpectedImproveResponse 객체로 변환하려고 시도합니다. 만약 JSON 파싱에 실패하면 에러를 로깅하고 BusinessException을 던집니다.

3. CompletableFuture가 반환되면 futures 목록에 추가됩니다.
4. resumeData 목록의 모든 요소에 대해 이 프로세스를 반복합니다.

그리고 위 반복문이 끝나고, 모든 비동기 작업이 완료되었는지 확인하기 위해서 
```
CompletableFuture<Void> allFutures = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]));
        try {
            allFutures.get();
        } catch (InterruptedException | ExecutionException e) {
            log.error(e.getMessage());
            throw new BusinessException(ErrorCode.THREAD_MALFUNCTION);
}
```
위 과정을 거칩니다.

allFutures.get() 호출은 allFutures 인스턴스에 연결된 모든 CompletableFuture 작업이 완료될 때까지 현재 스레드를 블록합니다. 

이는 모든 비동기 작업이 완료될 때까지 기다린 후에만 다음 코드를 실행하기 위함입니다. 

이렇게 각 ResumeRequest에 대해 병렬적으로 API 요청을 해서 응답을 받아오도록 로직을 수정했습니다.

## **TO-BE**

비동기 작업을 포함해서 변경된 로직은 아래와 같습니다.

```java
public ExpectedImproveResponse createdImprovementPointsAndAdvice(String job, String career, List<ResumeRequest> resumeData) {

        // 멀티스레드 호출
        List<CompletableFuture<ExpectedImproveResponse>> futures = new ArrayList<>();

        for (ResumeRequest data : resumeData) {
            CompletableFuture<ExpectedImproveResponse> future = CompletableFuture.supplyAsync(() -> {
                List<ChatMessage> chatMessages = generateAdviceMessage(job, career, data.resumeType(), data.content());
                try {
                    ChatCompletionResult chatCompletionResult = generate(chatMessages);

                    String futureResult = chatCompletionResult.getChoices().get(0).getMessage().getContent();


                    return objectMapper.readValue(futureResult, ExpectedImproveResponse.class);
                } catch (JsonProcessingException e) {
                    log.error(e.getMessage());
                    throw new BusinessException(ErrorCode.JSON_PARSING_FAILED);
                }
            }, executorService);

            futures.add(future);
        }
        log.info(futures.toString());
        // 모든 CompletableFuture가 완료될 때까지 대기
        CompletableFuture<Void> allFutures = CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]));
        try {
            allFutures.get();
        } catch (InterruptedException | ExecutionException e) {
            log.error(e.getMessage());
            throw new BusinessException(ErrorCode.THREAD_MALFUNCTION);
        }

        // CompletableFuture에서 결과를 추출해서 WhatGeneratedResponse 객체에 저장
        ExpectedImproveResponse result = new ExpectedImproveResponse();
        futures.stream()
                .map(CompletableFuture::join)
                .filter(content -> content.improvementResponse().size() != 0)
                .forEach(content -> result.improvementResponse().addAll(content.improvementResponse()));

        return result;
    }
```

시간에 따른 검증 테스트는 곧 테스트 코드 작성 이후 보완할 예정입니다.

## **TO-DO**

현재 프로젝트가 자바 코드로 되어있기 때문에 자바의 비동기 작업을 위한 클래스를 사용했지만, 만약 Spring Webflux와 코루틴을 사용한다면 아래와 같이 코드를 깔끔하게 바꿀 수 있을 것 같습니다.

```java
suspend fun createdExpectedQuestionsAndAnswer(job: String, career: String, resumeData: List<ResumeRequest>): ExpectedImproveResponse {
    val result = ConcurrentHashMap<String, MutableList<ImprovementResponse>>()

    coroutineScope {
        
        val jobs = resumeData.map { data ->
            launch {
                try {
                    val chatMessages = generateAdviceMessage(job, career, data.resumeType(), data.content())
                    val chatCompletionResult = generate(chatMessages)
                    val futureResult = chatCompletionResult.choices[0].message.content
                    val response = objectMapper.readValue(futureResult, ExpectedImproveResponse::class.java)
                    if (response.improvementResponse.isNotEmpty()) {
                        result[data.resumeType()] = response.improvementResponse
                    }
                } catch (e: Exception) {
                    log.error(e.message)
                }
            }
        }

        jobs.joinAll()
    }

    return WhatGeneratedImproveResponse(result)
}
```

Thread-safety를 보장하기 위해 ConcurrentHashMap을 사용했고,

각 코루틴에서 발생하는 예외를 try/catch 블록으로 처리하였습니다.

또한 coroutineScope 밖에서 joinAll을 호출하여, 코루틴이 취소될 경우 모든 하위 코루틴이 취소되도록 하였습니다.

## **레퍼런스**

[https://velog.io/@suyeon-jin/JAVA-CompletableFuture#4-completablefuture](https://velog.io/@suyeon-jin/JAVA-CompletableFuture#4-completablefuture)






















