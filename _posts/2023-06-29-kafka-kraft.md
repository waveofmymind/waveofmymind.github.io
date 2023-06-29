---
title: "주키퍼를 사용하지 않는 카프카 Kraft 모드"
date: 2023-06-29 17:29:00 +0900
aliases: 
tags: [Kafka,Kraft]
categories: [Kafka]
---

카프카의 컨트롤러로 주키퍼를 사용하고 멀티 브로커로 카프카를 실행하던 중, Kraft 모드에 대해 알게된 점을 공유하는 글입니다.

카프카 클러스터를 구성할 때에는 클러스터 환경 관리를 위한 코니네이터 애플리케이션이 필요합니다.

그래서 보통 아파치 주키퍼가 많이 사용되고 있습니다.

다만 주키퍼를 통한 카프카 외부에서 메타데이터 관리를 하다보니 데이터의 중복, 브로커와 
컨트롤러(주키퍼)사이의 메타데이터 정합성 문제, 시스템 복잡성 증가, 주키퍼와 카프카를 같이 실행함에 따라 자바 프로세스의 증가와 같은 더 많은 자원 소모의 문제점들이 있습니다.

카프카 자체가 아닌 외부에서 메타 데이터를 관리하기 때문에, 카프카를 사용함으로써 확장성과 사용시 제약사항에 한계성을 느끼게 되며, 결과적으로는 카프카의 확장성에 제한이 됩니다.

그래서 새로이 메타데이터 관리를 카프카 자체에서 하기 위해 만들어진 것이 KRaft모드입니다.

![Kafka New Quorum](/assets/img/2023-06-29-kafka-kraft/quorum.webp)

KRaft모드는 이전 컨트롤러를 대체하고, KRaft 합의 프로토콜 이벤트 기반 변형을 사용하는 Kafka의 새로운 쿼럼 컨트롤러 서비스를 사용합니다.


## KRaft모드란?

[KIP-500](https://issues.apache.org/jira/browse/KAFKA-9119)에 따르면, 카프카에서 주키퍼에 대한 의존성을 제거하고 있습니다.

그래서 카프카 2.8 버전 이상부터는 주키퍼 없이 카프카를 실행시킬 수 있는 KRaft 모드(Kafka Raft metadata mode)가 등장하게 되었습니다.

그리고,크래프트 모드를 사용하는 것에 대한 이점으로, 컨플루엔트 사이트에서는 아래와 같은 것을 내세우고 있습니다.

1. 새로운 메타데이터 관리로 제어 플레인 성능을 개선하여 Kafka 클러스터를 수백만 개의 파티션으로 확장할 수 있습니다.
2. 안정성을 개선하고 소프트웨어를 간소화하며 Kafka를 더 쉽게 모니터링, 관리 및 지원할 수 있습니다.
3. Kafka가 전체 시스템에 대해 단일 보안 모델을 갖도록 지원
4. Kafka를 시작할 수 있는 가벼운 단일 프로세스 방법 제공
5. 컨트롤러 페일오버를 거의 즉각적으로 수행

그리고 실제로, 리커버리 타임에 대해 주키퍼를 사용할 때보다 월등한 속도를 보여줍니다.

![Kraft Recovery](/assets/img/2023-06-29-kafka-kraft/failover.webp)


카프카를 실제로 설치해보면, sh파일이 모여있는 config 폴더에 kraft라는 폴더에 새로운 설정 파일이 추가되어 있음을 확인할 수 있습니다.

주키퍼 모드에 비해 추가되거나 삭제된 것은 아래와 같습니다.

**제거된 설정**

- zookeeper.connect
- zookeeper.*
- broker.id
- node.id로 대체됨

**추가된 설정**
- process.roles
- 해당 서버의 역할을 설정한다.
- node.id(broker.id 대체)
- controller.quorum.voters
- 기존 zookeeper quorum을 대체하는 controller quorum. 1대 이상 필요, 3대 or 5대 권장

### 작동 원리

쿼럼 컨트롤러는 Kraft 프로토콜을 사용해서 메타데이터가 쿼럼 전체에 복제되도록 해줍니다.

쿼럼 컨트롤러는 이벤트 기반 저장소 모델을 사용하여 상태를 저장하며, 이를 통해 내부 상태 시스템을 항상 정확하게 다시 만들 수 있습니다.

쿼럼 내의 다른 컨트롤러는 활성 컨트롤러가 만들고 로그에 저장하는 이벤트에 응답하여 활성 컨트롤러를 따릅니다. 따라서 예를 들어 파티셔닝 이벤트로 인해 한 노드가 일시 중지된 경우 다시 조인할 때 로그에 액세스하여 놓친 이벤트를 빠르게 따라잡을 수 있습니다.

### 얼리 액세스

카프카 2.8버전 부터 사용할 수 있는 Kraft 모드는 3.2버전까지는 개발 단계이므로 실 운영시에 사용하는 것을 권장하지 않습니다.

## 설치

저는 우선 리눅스 CentOS 7.8 버전을 사용하였고, 자바 17 버전을 설치해놓았습니다.

우선 카프카를 다운받아줍니다.

```sh
wget https://downloads.apache.org/kafka/3.4.1/kafka_2.13-3.5.0.tgz

tar xvf kafka_2.13-3.5.0.tgz -C /usr/local
```

압축을 풀 위치로 저는 /usr/local 폴더 내로 했습니다.

그리고 편의성을 위해 심볼릭 링크를 생성해줍니다.

```sh
cd /usr/local

ln -s. kafka_2.13-3.5.0 kafka
```

그리고 카프카 폴더로 가보면, config 폴더 내에 kraft 폴더가 존재함을 알 수 있습니다.

이제 카프카를 실행시키기 위해 server.properties를 바꿔주어야합니다.

kraft 폴더의 server.properties를 사용하면 됩니다.

그 중, 아래와 같은 점을 고치면 됩니다.

```
process.roles=broker,controller
node.id=0
controller.quorum.voters=0@172.17.20.57:9093,1@172.17.20.58:9093,2@172.17.20.59:9093
listeners=PLAINTEXT://:9092,CONTROLLER://:9093
advertised.listeners=PLAINTEXT://172.17.20.57:9092
controller.listener.names=CONTROLLER
log.dirs=/tmp/kraft-combined-logs
```

특히, 이제 카프카 서버가 브로커의 역할을 함과 동시에 컨트롤러 역할도 할 수 있기 때문에 process.roles를 설정하는 것은 필수입니다.

카프카 공식 리드미에서는 아래와 같이 예시를 들어 설명하고 있습니다.
> So if you have 10 brokers and 3 controllers named controller1, controller2, controller3, you might have the following configuration on controller1:

```
process.roles=controller
node.id=1
listeners=CONTROLLER://controller1.example.com:9093
controller.quorum.voters=1@controller1.example.com:9093,2@controller2.example.com:9093,3@controller3.example.com:9093
```

저는 위 설정에서 log.dirs에 대해서는 kafka 폴더와 같은 위치에 생성하려고

```
log.dirs=/usr/local/kafka/kraft-combined-logs

mkdir -p /usr/local/kafka/kraft-combined-logs
```

로 변경해주었습니다.

이제 서버를 실행하기 전에 format 명령을 해주어야하는데,

클러스터 ID를 UUID를 직접 생성해야합니다.

공식 리드미에 따르면 자동으로 생성되던 클러스터 ID 방식이 떄떄로는 오류를 모호하게 만들었다고 합니다.

새 클러스터 ID는 `kafka-storage.sh`를 사용해서 생성해줍니다.

```sh
$ ./bin/kafka-storage.sh random-uuid
xtzWWN4bTjitpL3kfd9s5g
``` 

이제 생성된 uuid를 복사하고, logs 폴더를 포맷해줍니다.

```sh
$ ./bin/kafka-storage.sh format -t <uuid> -c ./config/kraft/server.properties
Formatting /tmp/kraft-combined-logs
```

위와 같이 Formatting 메시지가 나오면 성공입니다.

이제 실행해봅시다.

```sh
$ ./bin/kafka-server-start.sh ./config/kraft/server.properties # 실행

$ ./bin/kafka-server-start.sh -daemon config/kraft/server.properties # 백그라운드 실행
...
```

성공적으로 포트가 오픈되었는지 확인해보면

```sh
sudo netstat -antp | grep 9092
tcp6       0      0 :::9092                 :::*                    LISTEN      17397/java

sudo netstat -antp | grep 9093
tcp6       0      0 :::9093                 :::*                    LISTEN      17397/java          
tcp6       0      0 10.178.0.2:9093         34.22.95.181:55582      ESTABLISHED 17397/java          
tcp6       0      0 10.178.0.2:55582        34.22.95.181:9093       ESTABLISHED 17397/java          
```

위와 같이 나오면 성공입니다.


## 레퍼런스 

- [CONFLUENT](https://developer.confluent.io/learn/kraft/)

- [Kafka Kraft README](https://github.com/apache/kafka/blob/2.8/config/kraft/README.md)







