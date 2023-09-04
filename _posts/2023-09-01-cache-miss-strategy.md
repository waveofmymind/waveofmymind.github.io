---
title: "동시성 문제를 해결하기 위한 캐시 미스와 데이터베이스 부하 관리 전략"
date: 2023-09-01 09:29:00 +0900
aliases: 
tags: [Redis,Spring Data Redis,Cache,Cache Miss]
categories: [Redis]
---

여러 비즈니스 로직이 캐시를 사용하고 있을 때,

만약 캐시에 아무런 데이터가 없이 동시에 많은 요청이 오게되면 캐시 미스가 발생하게 됩니다.

그리고 이러한 요청은 Look Aside 방식이기 때문에 DB로 질의를 하게 되는데요.

그렇게 되면 DB는 병목 현상이 발생해서 SPOF가 될 수 있습니다.

이전에 다루었던 `Cache Stempede` 문제를 해결하기 위한 `PER 알고리즘`을 적용한 로직은, 

만료되지 않은 핫 키에 대한 캐시 데이터를 확률적으로 TTL을 갱신 시켜 주기 때문에 위 해결 방법으로는 적합하지 않습니다.

그래서 순간적으로 많은 요청이 왔을 때 어떻게 캐시 미스 -> DB 질의로 이어지는 문제를 해결할 수 있을 지에 대해서 다루려고합니다.

## **Look-Aside**

`Look-Aside`방식은 데이터를 조회할 때 캐시에 먼저 데이터를 질의하는 방식입니다.

만약 캐시에 데이터가 없을 경우 `Cache Miss`가 발생하고, 해당 요청은 DB에서 데이터를 가져온 뒤 데이터를 캐시에 넣어주고 그 값을 반환합니다.

![look aside](/assets/img/2023-09-01-cache-miss-strategy/lookaside.webp)

이것을 `Lazy Loading`이라고도 합니다.

이 경우 캐시가 다운되더라도 DB를 통해서 조회 결과을 받을 수 있기 때문에 안정적이기도 하지만, 반대로 DB에 많은 요청이 가기 때문에 DB에 부하가 생길 수 있습니다.

이 경우 `Cache Warming`이라고 하는, DB에서 캐시로 데이터를 미리 넣어주는 작업을 하기도 합니다.

저도 처음에는 배치나 스케줄러를 통해 DB로부터 캐시로 데이터를 저장해놓는 방식을 떠올렸지만,

 약 많은 비즈니스 로직이 캐시를 사용할 경우 많은 데이터를 캐시에 저장해야하기 때문에 캐시에 부담이 갈 수 있습니다.

 특정 캐시 키에 대해서만 조회가 이루어질 경우에는 캐시 워밍 방법이 효과적일 것이라고 생각합니다.

 ## **해결 방법 1: 캐시 락**

 그렇다면 다시 상황으로 돌아가보면, 여러 요청이 특정 시간에 트래픽이 몰릴 경우

 다양한 데이터를 캐시에 올리는 것은 부담이 갈 수 있기 때문에 캐시 워밍은 선택하지 않았습니다.

 그렇다면 동시에 들어온 요청 중, 처음 들어온 요청만 DB에 질의 -> 캐시에 저장하고, 그 이후 요청은 캐시 힛을 발생시켜서 DB로 몰리는 부하를 해결할 수 있을 것 같습니다.

우선 락을 테스트하기 위해, 기본적인 도메인 클래스를 다음과 같이 정의했습니다.

```kotlin
@Entity
@Table(name = "article")
class Article(

    private val content: String,

    private val title: String,

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private val id: Long = 0L
)
```

그리고, 테스트를 위해 간단히 구현해본 Look-Aside 방식의 게시글 조회 비즈니스 로직입니다.

```kotlin
fun getArticle(articleId: Long): Article {
        val key = "article:$articleId"

        redisTemplate.opsForValue().get(key)?.let {
            return objectMapper.readValue(it as String, Article::class.java)
        }

        val article = articleRepository.findByIdOrNull(articleId) ?: throw Exception("Not found")

        redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(article), 5L, TimeUnit.SECONDS)

        return article
    }
```

우선 `key`로 캐시에 데이터가 있는지 확인하고, 없을 경우에만 DB에 조회를 해서 값을 캐시에 저장하고, 이를 반환합니다.

이제 준비는 되었으니, `JMeter`를 사용해서 테스트를 해보겠습니다.

**작성중**












