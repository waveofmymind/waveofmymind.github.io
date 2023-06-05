---
title: "도커 컴포즈를 이용해서 프로메테우스+그라파나 도커라이징하기 (1/2)"
date: 2023-06-05 21:12:00 +0900
aliases: 
tags: [docker,docker compose,prometheus,프로메테우스,그라파나,grafana,monitoring]
categories: [Spring]
---

프로젝트 진행 중 서버 모니터링 환경을 구축하게 되어 프로메테우스와 그라파나를 도커 컴포즈를 사용해서 도커라이징 한 경험을 공유하고자합니다.

## 준비 사항

우선, 스프링 부트 프로젝트에 아래 의존성을 추가해줍니다.

```
implementation 'org.springframework.boot:spring-boot-starter-actuator'
implementation 'io.micrometer:micrometer-registry-prometheus'
```

그리고 yml파일에 아래 사항을 추가해줍니다.
저는 운영환경에서 사용할 것이므로 application-prod.yml에 추가했습니다.

```yaml
spring:
  application:
    name: 프로젝트 이름

management:
  endpoints:
    web:
      exposure:
        include: "prometheus"
  metrics:
    tags:
      application: ${spring.application.name}
```
이것으로 우선 actuator 설정은 끝났습니다.

로컬 환경일 경우 http://localhost:8080/actuator/prometheus 경로로 접속하면, 메트릭이 나오게 됩니다.

## docker-compose.yml

이제, 도커 컴포즈를 사용하기 위해서 docker-compose.yml을 생성해야합니다.

저는 인스턴스에 실행중인 도커에 컨테이너로 실행시킬 것이기 때문에, /home 디렉토리에 monitor라는 디렉토리를 생성해서 그 안에 docker-compose.yml을 생성했습니다 (vim docker-compose.yml)

도커 컴포즈를 사용하는 이유는, 그라파나는 프로메테우스 메트릭을 시각화해주는 툴이기 때문에 프로메테우스에 의존해야합니다.

그렇기 떄문에 컨테이너가 여러개 실행되더라도 하나의 애플리케이션처럼 관리되기 위해서 도커 컴포즈로 실행시키는 것입니다.

또한 도커로 각 컨테이너를 실행시킬때, 필요한 명령어의 개수가 늘어나면 명령어 자체도 길어지기 때문에 기억하기 어렵습니다.

이제 docker-compose.yml을 작성해봅니다.

## 프로메테우스 서비스 정의

```yaml
version: '3.7'

services:
  prometheus: 
  	image: prom/prometheus #도커 이미지 명
  	container_name: prometheus #원하는 컨테이너 명을 입력해줍니다.
  	volumes:
  	  - ~/prometheus/config/:/etc/prometheus/
  	  - ~/prometheus/prometheus-volume:/prometheus
  	ports:
  	  - '9090:9090'
  	command:
  	  - '--web.enable-lifecycle'
  	  - '--config.file=/etc/prometheus/prometheus.yml'
    restart: always
  	networks:
  	  - monitor-network
```

이미지와 컨테이너 이름은 도커를 사용하신다면 알 것이기 때문에 생략하고,
볼륨에 대해서 설명하고자 합니다.

프로메테우스를 실행시킬 때 생성되는 파일이 생성될 위치를 정하고, 데이터를 관리해야하기 때문에 볼륨을 지정해주어야합니다.

즉, ~/prometheus/prometheus-volume과 /prometheus/를 서로 연결해서 호스트 시스템과 도커 컨테이너간의 특정 디렉토리를 공유하도록 하겠다는 것 입니다. 이제 둘 중 하나가 변경되면 나머지 한 쪽에도 반영됩니다.

docker에서 프로메테우스 컨테이너로 실행시키면 /etc/prometheus/ 경로로 파일이 생성되는데, 이를 인스턴스 내의 폴더에도 똑같이 생성해주도록 설정했습니다. 

이유는 컨테이너를 재시작하거나 삭제될 때 이전에 실행했던 프로메테우스 정보를 저장하기 위함입니다.

그리고 ~/prometheus/config/:/etc/prometheus/로 호스트 시스템의 config 디렉토리와 도커 컨테이너에서 실행되는 프로메테우스 디렉토리를 연결시킨 이유는, 아래의 command 섹터에 - '--config.file=/etc/prometheus/prometheus.yml로 호스트 시스템 내에서 저희가 설정한 yml파일을 도커 컨테이너로 실행시킬 프로메테우스 컨테이너의 설정으로 사용하기 위함입니다.

그리고 그라파나와 프로메테우스를 도커 네트워크로 연결하기 위해 monitor-network로 설정해줍니다.

## prometheus.yml

이제 위에 docker-compose.yml에 설정했던 디렉토리를 만들어줍니다.

저는 monitor라는 디렉토리에 docker-compose.yml을 생성했고, ~/prometheus/ 경로를 볼륨 설정 했습니다.

이에 맞게 docker-compose.yml이 존재하는 폴더에 /prometheus/config, /prometheus/prometheus-volume를 각각 생성해줍니다.

그리고 prometheus.yml을 config 폴더 내에 생성해줍니다.

```yaml
global:
  scrape_interval: 15s
  scrape_timeout: 15s

  external_labels:
    monitor: 'goodjob-monitor'
  query_log_file: saved.log

scrape_configs:
  - job_name: 'goodjob'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: '/actuator/prometheus'
    honor_labels: false
    honor_timestamps: false
    scheme: 'https'
    static_configs:
      - targets: ['www.waveofmymind.shop']
        labels:
          service : 'monitor-1'
```

설정 정보 하나씩 설명하면,
- scrape_interval: 데이터를 가져오는 빈도, 15초마다 가져오도록 설정
- scrape_timeout: 위에서 데이터를 가져오는 작업이 완료되기를 기다리는 시간을 설정
- evaluation_interval: 알람 규칙이 평가되는 빈도
- external_labels: 모든 시계열에 추가되는 라벨 설정
- query_log_file: 쿼리 로그를 기록할 파일의 경로(이름 변경 자유)
- job_name: job의 이름, 유니크한 것으로 설정
- metrics_path: 아까 스프링부트 프로젝트에서 정의한 프로메테우스 경로

입맛에 맞게 설정하면 됩니다.

그리고 query_log_file의 경우 .log로 끝나도록 정해야 합니다.
이는 프로메테우스가 실행될 때 저희가 지정한 파일 명(저의 경우 saved.log)로 생성해준다고 합니다.


이제 프로메테우스는 설정이 끝났습니다.



## 레퍼런스

[Grafana_Prometheus](https://luv-n-interest.tistory.com/1553)

[Prometheus를 docker로 구성해보기](https://velog.io/@swhan9404/Prometheus를-docker로-구성해보기)

[Nginx로 같은 도메인에 prometheus, alertmanager, grafana 띄우기
](https://velog.io/@swhan9404/Nginx로-같은-도메인에-prometheus-alertmanager-grafana-띄우기)


