---
title: "Redis Cluster vs Sentinel"
date: 2023-06-09 17:12:27 +0900
aliases: 
tags: [Redis]
categories: [Redis]
---

![Redis](/assets/img/redis.webp)

> Redis를 사용할 때 물리 머신이 가진 메모리의 한계를 초과하는 데이터를 저장하고 싶거나,
failover에 대한 처리를 통해 HA를 보장하려면 Sentinal이나 Cluster 등의 운영 방식을 선택해서 사용해야한다.

## Sentinel

![Redis Sentinel](/assets/img/redis-sentinel.webp)

### 기능

- 모니터링: Master/Slave가 제대로 동작하는지 지속적으로 감시한다.
- 자동 장애 조치
- 알림: failover되었을 때 pub/sub로 client에게 알리거나, shell script로 이메일이나 sms를 보낼 수 있다.

### 동작 방식

- Sentinal 인스턴스 과반 수 이상이 Master 장애를 감지하면 Slave중 하나를 Master로 승격시키고 기존의 Master는 Slave로 강등시킨다.

- Slave가 여러개 있을 경우 Slave가 새로운 Master로부터 데이터를 받을 수 있도록 재구성된다.

> 과반 수 이상으로 결정하는 이유는 만약 어느 Sentinel이 단순히 네트워크 문제로 Master와 연결되지 않을 수 있는데, 그 때 실제로 Master는 다운되지 않았으나 연결이 끊긴 Sentinel은 Master가 다운되었다고 판단할 수 있기 때문이다.

### failover 감지 방법

- **SDOWN: Subjectively down(주관적 다운)**
	- Sentinel에서 주기적으로 Master에게 보내는 Ping과 Info 명령의 응답이 3초(down-after-milliseconds에서 설정한 값) 동안 오지 않으면 주관적 다운으로 인지한다.
	- 센티널 한 대에서 판단한 것으로, 주관적 다운만으로는 장애조치를 진행하지 않는다.

- **ODOWN: Objectively down(객관적 다운)**
	- 설정한 quorum 이상의 센티널에서 해당 Master가 다운되었다고 인지하면 객관적 다운으로 인정하고 장애 조치를 진행한다.

### failover시 주의사항

- **get-master-addr-by-name**: Master,Slave 모두 다운되었을 때 센티널에 접속해 Master 서버 정보를 요청하면 다운된 서버 정보를 리턴한다. 따라서 Info sentinel 명령으로 마스터의 ststus를 확인해야한다.

- **Slave -> Master 승격 안되는 경우**: Slave 다운 -> Master 다운 -> 다운된 Slave 재시작시 이 서버는 Master로 전환되지 않는다. Slave의 redis.conf에 자신이 복제로 되어있고, 센티널도 복제라고 인식하고 있기 때문이다. 해결책은 Slave가 시작하기 전에 redis.conf에서 slaveof로 삭제하는 것이다.

### 기타

- Quorom: Redis 장애 발생시 몇 개의 센티널이 특정 Redis의 장애 발생을 감지해야 장애라고 판별하는지를 결정하는 기준 값. 보통 reids의 과반수 이상으로 설정한다.
- 센티널은 1차 복제만 Master 후보에 오를 수 있다. (복재 서버의 복제 서버는 불가능)
- 1차 복제 서버 중 replica-priority 값이 가장 작은 서버가 마스터에 선정된다. 0으로 설정하면 master로 승격 불가능하고 동일한 값이 있을 때에는 엔진에서 선택한다.
- 안정적 운영을 위해 3개 이상의 센티널을 만드는 것을 권장하는데, 서로 물리적으로 영향받지 않는 컴퓨터나 가상 머신에 설치되는 것이 좋다.
- 센티널은 내부적으로 redis의 Pub/Sub 기능을 사용해서 서로 정보를 주고받는다.
- 센티널 + 레디스 구조의 분산 시스템은 레디스가 비동기 복제를 사용하기때문에, 장애가 발생하는 동안 썼던 내용들이 유지됨을 보장할 수 없다.
- Sentinel을 Redis와 동일한 Node에 구성해도 되고, 별도로 구성해도 된다
- 클라이언트는 주어진 서비스를 담당하는 현재 레디스 마스터의 주소를 요청하기 위해 센티널에 연결한다. 장애 조치가 발생하면 센티널은 새 주소를 알려준다

## Cluster