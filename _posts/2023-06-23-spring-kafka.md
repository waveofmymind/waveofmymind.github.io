---
title: "Spring Kafka 사용하기"
date: 2023-06-23 21:29:00 +0900
aliases: 
tags: [Spring,Spring Kafka,Kafka]
categories: [Spring]
---

![Kafka](/assets/img/kafka.webp)

프로젝트에 비동기 처리를 위해 큐를 사용해야 할 일이 생겨 개인적으로 사용해보고 싶었던 카프카를 스프링에서 사용하는 예제를 공유하는 글입니다.

카프카에 대한 설명은 하지 않습니다.

환경: Spring Boot 3.1.0, Spring Kafka 3.0.8

## 준비 사항

우선 의존성을 추가해줍니다.

```
implementation 'org.springframework.kafka:spring-kafka:3.0.8'
```

그리고 yml 파일에 필요한 정보를 정의해줍니다.

```yaml
spring:
  kafka:
    bootstrap-servers: 3.34.97.97:9092
    consumer:
      # consumer bootstrap servers가 따로 존재하면 설정
      # bootstrap-servers: 3.34.97.97:9092

      # 식별 가능한 Consumer Group Id
      group-id: waveofmymind # 임의로 작성
      # Kafka 서버에 초기 offset이 없거나, 서버에 현재 offset이 더 이상 존재하지 않을 경우 수행할 작업을 설정
      # latest: 가장 최근에 생산된 메시지로 offeset reset
      # earliest: 가장 오래된 메시지로 offeset reset
      # none: offset 정보가 없으면 Exception 발생
      auto-offset-reset: earliest
      # 데이터를 받아올 때, key/value를 역직렬화
      # JSON 데이터를 받아올 것이라면 JsonDeserializer
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.apache.kafka.common.serialization.StringDeserializer
    producer:
      # producer bootstrap servers가 따로 존재하면 설정
      # bootstrap-servers: 3.34.97.97:9092

      # 데이터를 보낼 때, key/value를 직렬화
      # JSON 데이터를 보낼 것이라면 JsonDeserializer
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer
```

이외에도 더 많은 설정을 할 수 있는데, [여기](https://oingdaddy.tistory.com/307)를 참고해주세요

이제 간단한 설정을 다 끝났고, 간단한 Pub/Sub를 해봅시다.

## Spring에서

우선 포스트맨으로 요청을 보내면 프로젝트에서 카프카 토픽을 생성해서 메시지를 보내는 간단한 예제입니다.

```kotlin
@RestController
@RequestMapping("/kafka")
class KafkaController(
	private val KafkaProducer producer
) {

	@PostMapping("/publish")
	fun publish(@RequestParam message: String): String {
		producer.sendMessage(message)
		return "success"
	}
}

@Service
class KafkaProducer(
	private val KafkaTemplate<String, String> kafkaTemplate
) {
	private val = TOPIC="Test"

	fun sendMessage(message: String) {
		println(String.format("Produce message : %s", message))
		kafkaTemplate.send(TOPIC, message)
	}

}

@Service
class KafkaConsumer {

	@KafkaListener(topics = "Test", groupId = "waveofmymind")
	fun consume(message: String) {
		println(String.format("Consumed message : %s", message))
	}
}
```

작성 중




