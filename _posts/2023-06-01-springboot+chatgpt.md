---
title: "스프링 부트에서 챗 GPT를 사용해보자"
date: 2023-06-01 10:12:00 +0900
aliases: 
tags: [openai,chatgpt,Spring,스프링]
categories: [Spring]
---

프로젝트 진행중 챗 GPT를 사용해서 이력서 내용 중 개선할만한 점이 있는지 검토를 받기 위해 OPEN AI의 외부 API를 사용했던 점을 공유하려 합니다.

## **준비 사항**

챗 GPT를 사용하기 위해 외부 라이브러리중, 가장 별이 많은 아래 라이브러리를 사용했습니다.

[https://github.com/TheoKanning/openai-java](https://github.com/TheoKanning/openai-java)

저는 Gradle로 프로젝트를 진행하고 있기 때문에, 아래 의존성을 추가해줍니다.

```java
implementation "com.theokanning.openai-gpt3-java:api:0.12.0"
implementation "com.theokanning.openai-gpt3-java:service:0.12.0"
```

그리고 챗 GPT API를 사용하기 위해서 OPEN AI에서 제공하는 토큰이 필요합니다.

[https://platform.openai.com/](https://platform.openai.com/)

## **Completion vs ChatCompletion**

챗 GPT API는 크게 두가지 기능을 제공하고 있습니다.

컴플리션은 단순 요청에 대한 대답을 주는 기능으로써, 사용하기 간편하지만 단점으로는 챗 GPT가 이전 내용에 대한 기억을 하지 못하기 때문에, 챗 GPT와 처음 대화한 기준의 답변만 받을 수 있습니다.

그에 반해 챗 컴플리션은 GPT와 채팅하듯이 GPT가 기억할 내용을 미리 보내서 원하는 답변을 받을 수 있습니다.

저는 이력서 검토를 받기 위해서 챗 GPT에게 적절한 프롬프트를 학습시킨 뒤, 사용자의 요청을 보낼 생각이기 때문에 챗 컴플리션을 사용하려고 합니다.

또한, 사용해본 결과 일반 컴플리션의 경우는 3.5-turbo는 지원하지 않는 것 같습니다.

그리고 GPT-4도 지원한다고 하니, 라이브러리는 최신 버전으로 받아줍니다.

## **OpenAiService**

저희가 사용하려는 라이브러리의 핵심 비즈니스 클래스입니다.

이를 초기화할 때는 파라미터로 위에서 발급했던 Open Ai Token과 타임아웃 시간을 넘겨주어야합니다.

위 서비스는 응답으로 챗 GPT에 의한 대답이 모두 완성되고 나서 오기때문에, 타임아웃을 설정하지 않으면 TIME OUT 이슈가 발생합니다.

그래서 저는 추후 챗 컴플리션을 요청하기 위한 객체에 필요한 상수와 OpenAiService를 빈으로 등록하기 위해서 GptConfig라는 클래스를 아래와 같이 생성했습니다.

```java
@Configuration
public class GptConfig {

    public final static String MODEL = "gpt-3.5-turbo";
    public final static double TOP_P = 1.0;
    public final static int MAX_TOKEN = 2000;
    public final static double TEMPERATURE = 1.0;
    public final static Duration TIME_OUT = Duration.ofSeconds(300);

    @Value("${openai.token}")
    private String token;

    @Bean
    public OpenAiService openAiService() {
        return new OpenAiService(token, TIME_OUT);
    }
}
```

위의 상수들은 ChatCompltionRequest라는 객체로 챗 컴플리션을 요청하게 되는데, 이를 생성하기 위한 프로퍼티입니다.

- MODEL: 저희가 사용하고자 하는 모델 ID 값입니다.
- TEMPERATURE, TOP_P: 생성될 다음 단어의 샘플링 방법 등을 지정하지만, 둘 다 변경하는 것은 권하지 않는다고 합니다. 저는 중간값으로 먼저 서비스를 시험하기 위해 둘다 1로 선언했습니다.
- MAX_TOKEN: 생성될 답변의 길이를 의미합니다.

저는 또한 타임아웃 이슈를 피하기 위해 넉넉하게 300초로 타임아웃을 정했습니다.

그리고, OpenAiService를 살펴보면 아래와 같이 되어있습니다.

```java
public class OpenAiService {

    private static final String BASE_URL = "https://api.openai.com/";
    private static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(10);
    private static final ObjectMapper mapper = defaultObjectMapper();

    private final OpenAiApi api;
    private final ExecutorService executorService;

    /**
     * Creates a new OpenAiService that wraps OpenAiApi
     *
     * @param token OpenAi token string "sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
     */
    public OpenAiService(final String token) {
        this(token, DEFAULT_TIMEOUT);
    }

    /**
     * Creates a new OpenAiService that wraps OpenAiApi
     *
     * @param token   OpenAi token string "sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
     * @param timeout http read timeout, Duration.ZERO means no timeout
     */
    public OpenAiService(final String token, final Duration timeout) {
        ObjectMapper mapper = defaultObjectMapper();
        OkHttpClient client = defaultClient(token, timeout);
        Retrofit retrofit = defaultRetrofit(client, mapper);

        this.api = retrofit.create(OpenAiApi.class);
        this.executorService = client.dispatcher().executorService();
    }

	// ...
    
}
```

Retrofit을 사용해서 API 통신을 하며, 타임아웃은 디폴트가 10초이기 때문에 타임아웃을 정의해주는게 좋을 것 같습니다.

## **과정**

챗 컴플리션의 경우 OPEN AI API 사이트에서 기능을 번역하면, 채팅 기능처럼 이전의 내용을 기억하고 답변을 제공한다고 했습니다.

요청 데이터로는 아래와 같습니다.

```bash
{
  "model": "gpt-3.5-turbo",
  "messages": [{"role": "user", "content": "Hello!"}]
}
```

유저인지, 시스템인지를 정하고, 보낼 메시지를 담아야합니다.

 
저희가 사용하는 라이브러리에서는 아래와 같이 ChatMessage라는 클래스를 사용할 수 있습니다.

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

	/**
	 * Must be either 'system', 'user', or 'assistant'.<br>
	 * You may use {@link ChatMessageRole} enum.
	 */
	String role;
	String content;
}
```

저는 우선 시스템이 기억할 ChatMessage 객체를 먼저 보낼 것이기 떄문에, 이력서 검토를 했으면 좋겠다는 프롬프트를 content로, role은 system으로 생성하면 될 것 같습니다.

그래서 아래와 같이 챗 메시지 객체를 생성했습니다.

```java
ChatMessage systemMessage = new ChatMessage(ChatMessageRole.SYSTEM.value(), prompt);
ChatMessage userMessage = new ChatMessage(ChatMessageRole.USER.value(), content);
return List.of(systemMessage, userMessage);
```

먼저 시스템이 기억할 메시지로 프롬프트를 보내고, 그다음에 사용자의 이력서 정보를 보내게 됩니다.

그리고 이제 챗 컴플리션을 요청하기 위해 ChatCompletionRequest 객체를 생성하고, OpenAiService가 지원하는 createChatCompletion() 메서드를 사용해서 답변을 제공받아봅시다.

우선 GptConfig에서 정의했던 상수와 위에서 만들었던 ChatMessage 배열을 사용해서 ChatCompletionRequest 객체를 생성할 수 있습니다.

```java
public ChatCompletionResult generate(List<ChatMessage> chatMessages) {

        ChatCompletionRequest build = ChatCompletionRequest.builder()
                .messages(chatMessages)
                .maxTokens(GptConfig.MAX_TOKEN)
                .temperature(GptConfig.TEMPERATURE)
                .topP(GptConfig.TOP_P)
                .model(GptConfig.MODEL)
                .build();

        return openAiService.createChatCompletion(build);

    }
```

createChatCompletion() 메서드를 들어가보면 아래와 같이 되어 있습니다.

```java
public ChatCompletionResult createChatCompletion(ChatCompletionRequest request) {
        return execute(api.createChatCompletion(request));
    }
    
@POST("/v1/chat/completions")
Single<ChatCompletionResult> createChatCompletion(@Body ChatCompletionRequest request);
```

위에서 생성한 ChatCompletionRequest 객체로 ChatCompletionResult 객체를 얻어옵니다.

ChatCompletionResult 객체는 OPEN AI API사이트에서 볼 수 있다 시피 아래와 같이 구성되어있습니다.

```bash
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "\n\nHello there, how may I assist you today?",
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 12,
    "total_tokens": 21
  }
}
```

그 중 저희가 필요한 내용인 message 배열의 content를 가져오겠습니다.

저는 객체에 content를 담을 것이기 때문에, 직렬화를 위해 응답을 JSON 형식으로 보내달라고 했습니다.

```bash
"improvementResponse" : [
                        { "type" : "Type of improvement point", "improvementPoint" : "content", "advice" : "content" },
                            { repetition }
                    ]
```

그리고 objectMapper를 통해 JSON을 객체로 변환시켜줍니다.

```java
String futureResult = chatCompletionResult.getChoices().get(0).getMessage().getContent();
return objectMapper.readValue(futureResult, ImprovePointResponse.class);
```

ImprovePointResponse는 개선할만한 점인 improvementPoint와 조언인 advice를 리스트로 가지는 객체입니다.

## **결과**

위에서 생성한 ImprovePointResponse는 아래와 같이 뷰에서 나타낼 수 있습니다.

![이력서 개선 사항](/assets/img/2023-06-01-springboot+chatgpt/result.webp)

만약, CHAT GPT에게 받을 메시지를 더 정교하게 만들고 싶으면, 위에서 ChatMessage 객체를 더 추가해서 답변을 요청하면 될 것 같습니다.

또한, Chat GPT 사이트에서 이용할 때와 같이 실시간으로 답변이 생성되는 스트리밍 API도 지원하고 있습니다. 

저는 질문과 대답만을 받기 위한 서비스를 구현하고 있기 때문에, 그에 대한 내용은 저희가 사용한 라이브러리 사이트에서 도움을 받을 수 있을 것 같습니다.

## **TO-DO**

생성 AI를 적용하는 서비스들도 늘어나고 있기 때문에 백엔드 개발자로써 한번쯤은 사용해보는게 좋을 것이라고 생각해서 시작한 프로젝트입니다.

그러나 특정 외부 라이브러리를 사용하기 때문에 OPEN AI의 공식 문서를 살펴보는 것이 큰 도움이 되었습니다.


개선 사항으로는 3.5 버전을 사용하지만 답변을 요청할 때 짧게는 1분에서 길게는 5분 정도의 시간이 소요되는 것 같습니다.

외부 API를 사용하는 것이기 때문에 걸리는 시간은 더이상 줄일 수 없을 것이라고 생각해서,

서비스를 제공할 때 미리 소요 시간을 안내하면서, 제출하고 나서 로딩 화면을 추가로 보여주는 것이 좋을 것 같습니다.

## **레퍼런스**

[https://github.com/TheoKanning/openai-java](https://github.com/TheoKanning/openai-java)

[https://platform.openai.com/docs/api-reference/chat/create](https://platform.openai.com/docs/api-reference/chat/create)

[https://joecp17.tistory.com/72?category=1034519](https://joecp17.tistory.com/72?category=1034519)











