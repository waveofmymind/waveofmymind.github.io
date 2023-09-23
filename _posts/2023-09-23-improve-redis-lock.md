---
title: "분산락이 가지는 문제점과 보완 방법"
date: 2023-09-23 00:29:00 +0900
aliases: 
tags: [Distributed Lock,DB Lock]
categories: [Spring]
---

이전에 분산락을 구현하기 위해 레디스를 사용했습니다.

그러나 레디스는 기본 설정에서도 아시다시피 6379 포트로 실행되기 때문에,

스프링 서버와 통신을 할 경우 TCP/IP 기반의 네트워크 통신을 통해 데이터를 주고받습니다.

그러나 두가지 문제점이 발생할 수 있습니다.

1. 네트워크가 문제가 있을 때 레디스를 사용할 수 없다.

2. 레디스 서버가 내려갔을 때, 동시성 문제가 다시 발생한다.

즉, 락을 레디스만을 의존해서 구현하게 되는 것은, "어떤 순간에도 동시성 문제를 보장해준다" 라는 것을 지켜주지 못합니다.

그래서 저는 여기에 DB 락을 추가하여 애플리케이션 레벨에 DB 레벨에서도 락을 거는 방법으로 보완해보고자 합니다.

그리고 DB 락을 추가했을 때, 성능이 어떻게 되는지도 비교해보겠습니다.

## **AS-IS**

'게시글 조회시 게시글의 조회수가 1만큼 증가한다.'라는 비즈니스 로직을 분산락을 사용해서 구현해봤습니다.

```kotlin
fun increaseViewCountWithLock(articleId: Long) {
        val key = "article:$articleId"

        val lock = redissonClient.getLock(key)

        try {
            if (lock.tryLock(10, 10, TimeUnit.SECONDS)) {
                val article = articleRepository.findByIdOrNull(articleId)?.also {
                    it.increaseViewCount()
                }
                article?.let { articleRepository.save(it) }
            } else {
                throw LockingFailedException("락 획득 실패: $articleId")
            }

        } finally {
            if (lock.isHeldByCurrentThread) {
                lock.unlock()
            }
        }
    }
```
조회수 증가시 락을 획득했을 경우에만 조회수를 증가시킵니다.

락을 획득하지 못했을 때, 10초까지 기다려보고 그 이후에는 `LockingFailedException`이 발생합니다.

이를 JMeter를 이용해서 테스트해보겠습니다.














