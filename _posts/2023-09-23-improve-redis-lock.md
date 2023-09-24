---
title: "분산락이 가지는 문제점과 보완 방법"
date: 2023-09-23 00:29:00 +0900
aliases: 
tags: [Distributed Lock,DB Lock]
categories: [Spring]
---

이전에 분산락을 구현하기 위해 레디스를 사용했습니다.

레디스는 스프링 서버와 통신을 할 경우 TCP/IP 기반의 네트워크 통신을 통해 데이터를 주고받습니다.

그러나 여기에 두가지 문제점이 발생할 수 있습니다.

1. 네트워크가 문제가 있을 때 레디스를 사용할 수 없다.

2. 레디스 서버가 내려갔을 때, 동시성 문제가 다시 발생한다.

즉, 락을 레디스만을 의존해서 구현하게 되는 것은, "어떤 순간에도 동시성 문제를 보장해준다" 라는 것을 지켜주지 못합니다.

그래서 저는 여기에 DB 락을 추가하여 애플리케이션 레벨에 DB 레벨에서도 락을 거는 방법으로 보완해보고자 합니다.

그리고 DB 락을 추가했을 때, 성능이 어떻게 되는지도 비교해보겠습니다.

## **AS-IS**

'게시글 조회시 게시글의 조회수가 1만큼 증가한다.'라는 비즈니스 로직을 분산락을 사용해서 구현해봤습니다.

```kotlin
fun getArticleWithLock(articleId: Long): Article {
        val key = "article:$articleId"
        val lockKey = "article:lock:$articleId"
        val lock = redissonClient.getLock(lockKey)

        try {
            if (lock.tryLock(10, 10, TimeUnit.SECONDS)) {
                return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
                    log.info("cache hit")
                    objectMapper.convertValue(cachedArticle, Article::class.java).also {
                        it.increaseViewCount()
                    }
                } ?: run {
                    log.info("cache miss")
                    articleRepository.findByIdOrNull(articleId)?
                    .also { article ->
                        redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
                        article.increaseViewCount()
                    }.also { it!!.increaseViewCount() } ?: throw ArticleNotFountException()
                }
            } else {
                throw LockingFailedException("$articleId")
            }
        } finally {
            if (lock.isHeldByCurrentThread) {
                lock.unlock()
            }
        }
    }
```
`tryLock()`으로 락 획득을 10초동안 시도하고 없을 경우 `LockingFailedException`을 던집니다.

그리고 락을 얻더라도 게시글을 조회했을 때, 게시글이 없으면 `ArticleNotFoundException`을 던집니다.

즉 락에 대한 점유 시도 이후 실질적인 조회가 이루어지기 때문에

레디스 서버에 문제가 있거나, 네트워크가 원활하지 않을 경우 아예 게시글 조회 자체가 되지 않는 문제가 발생합니다.

## **락 획득에 실패할 경우에도 조회 허용**

락을 획득하지 못하면 DB 조회를 통해 게시글을 조회할 경우 아래와 같이 구현할 수 있습니다.

```kotlin
fun getArticleWithLock(articleId: Long): Article {
    val key = "article:$articleId"
    val lockKey = "article:lock:$articleId"
    val lock = redissonClient.getLock(lockKey)

    try {
        if (lock.tryLock(10, 10, TimeUnit.SECONDS)) {
            // 락을 얻었을 때의 로직
            return getArticleFromCacheOrDatabase(key, articleId)
        } else {
            // 락을 얻지 못했을 때의 로직
            log.warn("Could not acquire lock for articleId: $articleId")
            return getArticleFromCacheOrDatabase(key, articleId)
        }
    } finally {
        if (lock.isHeldByCurrentThread) {
            lock.unlock()
        }
    }
}

private fun getArticleFromCacheOrDatabase(key: String, articleId: Long): Article {
    return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
        log.info("Cache hit")
        objectMapper.convertValue(cachedArticle, Article::class.java).also {
            it.increaseViewCount()
        }
    } ?: run {
        log.info("Cache miss")
        articleRepository.findByIdOrNull(articleId)?.also { article ->
            redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
            article.increaseViewCount()
        }.also { it!!.increaseViewCount() } ?: throw ArticleNotFountException()
    }
}
```

이제 10초 동안 락을 얻지 못해도 캐시를 조회할 수 있게됩니다.


















