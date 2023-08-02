---
title: "Cache Stampede 문제를 해결하기 위한 캐시 성능 개선 전략"
date: 2023-08-02 09:29:00 +0900
aliases: 
tags: [Cache,Redis]
categories: [Trouble Shooting]
---

이전에 굿잡 프로젝트에서 게시글 목록 조회에 캐시를 적용했는데요.

TTL을 5초로 짧게 설정하면서 생긴 문제에 대한 해결 과정을 공유하고자 합니다.

## **Cache Stampede는 왜 발생할까?**

캐시를 사용하게 되면 지연로딩 방식으로 전략을 세우며, 이는 캐시에 요청 데이터가 있으면 캐시에 있는 데이터를 사용하고, 없을 경우에 데이터 스토어에 데이터를 요청하게 됩니다.

그리고 해당 데이터를 캐시에 쓰고, 다음 요청에서는 캐시에 있는 데이터를 사용할 수 있게 됩니다.

그러나 자주 변경되어야 하는 데이터의 경우 보통 `TTL`을 설정하게 되는데요.

AWS에서도 캐싱 전략으로 데이터를 최신 상태로 유지함과 동시에 복잡성을 줄이기 위해 TTL을 추가하는 것을 권장하고 있습니다.

그러나 TTL을 설정하는 것은 트래픽이 많아질 경우 문제점이 될 수 있는데요.

만약 많은 요청이 캐시 힛으로 데이터를 응답중에, 캐시 만료기간이 되면 어떻게 될까요?

만료 시간이 도달함에 따라 캐시에서 데이터가 날아가기 때문에 데이터 스토어로의 많은 요청이 몰리게 됩니다.

이러한 현상을 `Cache Stampede`라고도 합니다.

그리고 지연로딩 방식에 따라서 해당 데이터 스토어의 많은 요청들이 캐시에 써지게 되고,

`Dubplicate read`와 `Duplicate write`가 발생하게 되는 것입니다.

즉 아래와 같이 그림으로 나타내어집니다.

![Hot key](/assets/img/2023-08-02-improve-cache/p1.webp)

요청에 대해서 캐시에 데이터가 없을 경우 서버는 DB에서 데이터를 가져와 레디스에 저장하게 되는데,

키가 만료되는 시점에는 동시에 많은 서버에서 이 키를 참조하는 시점이 겹치게 됩니다.

## **배치 작업을 통한 캐시 데이터 갱신**

가장 먼저 떠올릴 수 있는 해결 방법은 주기적으로 캐시 데이터를 갱신하는 방법입니다.

배치 작업을 통해서 캐시 데이터를 갱신하게 되면 문제를 해결할 수 있다고 판단했습니다.

즉, TTL을 설정하여 만료 시간을 주어 캐시 데이터를 삭제시키는 것은 데이터가 자주 갱신되어야하기 때문인데,

TTL을 설정하지 않고 배치 작업을 통해 캐시 데이터를 갱신시키는 방법입니다.

장점으로는, 만료 시간을 정하지 않기 때문에 **만료가 되지 않는다.**라는 것을 보장할 수 있습니다.

단점으로는, 배치를 사용하기 위해 추가적인 리소스가 필요하며, 결국 배치 작업을 통해 갱신할 키를 직접 선정해야하므로 추후 유지보수에 있어서 번거로움이 있을 수 있습니다.

## **캐시 미스에서 Lock을 사용하기**

캐시 미스가 발생할 경우 DB에 가는 요청에 대해서 Lock을 활용해서 중복 조회, 수정을 방지하는 전략입니다.

이는 `Cache Stampede`를 발생하는 것을 막을 수 있지만, 이 때문에 다른 요청들이 대기하게 되어 병목 현상을 초래합니다.

## **Probabilistic Early Expiration**

알고리즘을 사용해서 TTL 만료 전에 데이터를 갱신시키는 방법입니다.

핫 키에 대해서 TTL 만료를 연장시킴으로써 연장이 지속적으로 이루어지기 때문에 `Cache Stampede` 발생을 막을 수 있습니다.

```python
def fetch_aot(key, expiry_gap_ms):
    ttl_ms = redis.pttl(key) # pttl은 millisecond 단위

    if ttl_ms - (random() * expiry_gap_ms) > 0:
        return redis.get(key)

    return None

# Usage
fetch_aot('foo', 2000)
```

또한 확률에 따라 갱신 확률이 높아지기 때문에 핫 키를 관리할 필요가 없습니다.

![PER](/assets/img/2023-08-02-improve-cache/p3.webp)

## PER 알고리즘 적용하기

즉, TTL까지 남은 시간이 -∆βlog(rand())보다 **작거나 같을 경우** 해당 키를 갱신시켜야합니다.


**게시글 작성 중**




## 레퍼런스

- [AWS ElasticCache - 캐싱 전략](https://docs.aws.amazon.com/ko_kr/AmazonElastiCache/latest/mem-ug/Strategies.html)

- [RedisConf 2020 - Improve Cache Speed at Scale](https://www.youtube.com/watch?v=mPg20ykAFU4&list=PL83Wfqi-zYZGPnJqkVn9yeNCMX-V6Pvzm&index=3&ab_channel=Redis)

- [Probablistic Early Recomputation (PER) 알고리즘에 대해 알아보자
](https://bakjuna.tistory.com/93)



