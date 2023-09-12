---
title: "동시성 문제를 해결하기 위한 캐시 미스와 데이터베이스 부하 관리 전략"
date: 2023-09-04 09:29:00 +0900
aliases: 
tags: [Redis,Spring Data Redis,Cache,Cache Miss]
categories: [Redis]
---

저는 주로 캐시를 사용할 경우 **Look Aside** 패턴으로 요청이 캐시를 먼저 바라보게 하는 편입니다.

그러나 이 방법은 캐시에 데이터가 없을 경우 DB에 질의를 하기 때문에, 동시에 여러 요청이 같은 키에 대해서 조회를 할 경우 `Cache Stampede` 문제가 발생합니다.

그렇게 되면 DB는 병목 현상의 원인이 되며,즉 SPOF가 될 수 있습니다.

이전에 다루었던 핫 키 캐시 만료 문제를 개선하기 위한 `PER 알고리즘`을 적용한 로직은 만료되지 않은 핫 키에 대한 캐시 데이터를 확률적으로 TTL을 갱신 시켜 주기 때문에 위 해결 방법으로는 적합하지 않습니다.

그래서 순간적으로 많은 요청이 왔을 때 어떻게 캐시 미스 -> DB 질의로 이어지는 문제를 해결할 수 있을 지에 대해서 다루어보려고 합니다.

## **Look-Aside**

우선 Look-Aside 방식에 대해서 다시 정리해봅니다.

`Look-Aside`방식은 데이터를 조회할 때 캐시에 먼저 데이터를 질의하는 방식입니다.

만약 캐시에 데이터가 없을 경우 `Cache Miss`가 발생하고, 해당 요청은 DB에서 데이터를 가져온 뒤 데이터를 캐시에 넣어주고 그 값을 반환합니다.

![look aside](/assets/img/2023-09-04-cache-miss-strategy/lookaside.webp)

이것을 `Lazy Loading`이라고도 합니다.

이 경우 캐시가 다운되더라도 DB를 통해서 조회 결과을 받을 수 있기 때문에 안정적이기도 하지만, 반대로 DB에 많은 요청이 가기 때문에 DB에 부하가 생길 수 있습니다.

이 경우 `Cache Warming`이라고 하는, DB에서 캐시로 데이터를 미리 넣어주는 작업을 하기도 합니다.

저도 처음에는 배치나 스케줄러를 통해 DB로부터 캐시로 데이터를 저장해놓는 방식을 떠올렸지만,

많은 비즈니스 로직이 캐시를 사용할 경우 많은 데이터를 캐시에 저장해야하기 때문에 캐시에 부담이 갈 수 있습니다.

특정 캐시 키에 대해서만 조회가 이루어질 경우에는 캐시 워밍 방법이 효과적일 것이라고 생각합니다.

## **문제 상황**

우선 기본적인 테스트를 해보기 위해 구현한 게시글 엔티티와 게시글 조회에 대한 비즈니스 로직입니다.


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

게시글 조회같은 경우 위에서 언급했던 `Look-Aside`방식으로 구현했습니다

캐시에 선 조회후 값이 없을 경우 DB에 직접 질의하고, 반환된 값을 캐시에 저장하고 반환합니다.

```kotlin
fun getArticle(articleId: Long): Article {
        val key = "article:$articleId"

        return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
            log.info("cache hit")
            objectMapper.convertValue(cachedArticle, Article::class.java)
        } ?: run {
            log.info("cache miss")
            articleRepository.findByIdOrNull(articleId)?.also { article ->
                redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
            } ?: throw Exception("not found")
        }
    }
```

우선 `key`로 캐시에 데이터가 있는지 확인하고, 없을 경우에만 DB에 조회를 해서 값을 캐시에 저장하고, 이를 반환합니다.

이제 준비는 되었으니, `JMeter`를 사용해서 테스트를 해보겠습니다.

쓰레드 그룹은 10에 loop-count는 2로 총 10회의 동시 요청이 발생하는 상황에서의 테스트를 진행했습니다.

![result1](/assets/img/2023-09-04-cache-miss-strategy/result1.webp)

모든 요청 10개에 대해서 cache miss만 10번 발생한 모습입니다.

항상 캐시를 먼저 확인하기 때문에 cache hit을 기대했지만, 어떤 요청도 캐시를 타지 못했습니다.

이는 모든 요청이 동시에 캐시 미스가 발생해서 DB에 쿼리가 모두 발생한 것입니다.

## **락을 활용한 동시성 이슈 해결하기**

같은 키 값으로 동시에 많은 요청이 오게되면 동일한 키에 대해서 락을 두어 해결할 수 있을 것 같습니다.

### Redisson

락을 사용하기 위해 Redisson을 사용합니다.

`Lettuce`의 경우에도 락을 지원하고 있지만, retry, timeout하는 과정을 직접 구현해주어야한다는 번거로움이 있으며,

`Redisson`의 경우 락 인터페이스를 지원하기 때문에 락 타임아웃과, 자동 해제와 같은 기능을 간단하게 사용할 수 있습니다.

또한 `Lettuce`는 락이 해제되었는지 지속적으로 확인하는 스핀 락 방식으로 동작하기때문에 추후 더 많은 요청이 올 경우 Redis에 부하가 갈 수 있습니다.

반면에 `Redisson`은 Pub/Sub 방식으로 락이 해제되면 Subscribe하는 클라이언트는 락을 헤제되었다는 신호를 받고 락 획득을 시도합니다.

```kotlin
fun getArticle(articleId: Long): Article {
        val key = "article:$articleId"
        val lockKey = "article:lock:$articleId"
        val lock = redissonClient.getLock(lockKey)

        try {
            if (lock.tryLock(10, 10, TimeUnit.SECONDS)) {
                return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
                    log.info("cache hit")
                    objectMapper.convertValue(cachedArticle, Article::class.java)
                } ?: run {
                    log.info("cache miss")
                    articleRepository.findByIdOrNull(articleId)?.also { article ->
                        redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
                    } ?: throw Exception("not found")
                }
            } else {
                throw Exception("Could not acquire lock")
            }
        } finally {
            if (lock.isHeldByCurrentThread) {
                lock.unlock()
            }
        }
    }
```

락을 사용한 비즈니스 로직입니다.

`tryLock()`에 첫번째 인자는 waitTime으로, 락 획득에 대기하는 시간입니다. 0으로 설정하면 딱 한번만 락 획득을 시도합니다.

두번째 인자는 leaseTime으로, tryLock으로 Lock을 얻었을 때 락을 leaseTime만큼만 유지하고 해제합니다.

이 로직으로 다시 10개의 동시 요청 테스트를 해보겠습니다.

![result2](/assets/img/2023-09-04-cache-miss-strategy/result2.webp)

저희가 원하는대로 10번의 동시 요청에 대해서 가장 먼저 온 요청 1개만 캐시 미스가 발생하고, 그 뒤 요청은 모두 캐시 힛이 발생한 것을 알 수 있습니다.

## DB 사용률 확인

락을 사용하기 전과 사용한 후에 대한 CPU 사용률과 캐시 미스 Rate를 통해 지표를 확인해보겠습니다.

AWS의 ElastiCache와 RDS를 사용하면, 서버에 대한 모니터링 지표를 손쉽게 확인할 수 있기 때문에 테스트 용도로 사용했습니다.

### 락 사용 전

### 락 사용 후
























