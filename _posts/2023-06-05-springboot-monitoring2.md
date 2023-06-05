---
title: "도커 컴포즈를 이용해서 프로메테우스+그라파나 도커라이징하기 (2/2)"
date: 2023-06-05 22:23:00 +0900
aliases: 
tags: [docker,docker compose,prometheus,프로메테우스,그라파나,grafana,monitoring]
categories: [Spring]
---

이전에 프로메테우스에 대한 설정은 완료했으니, 이제 그라파나에 대한 도커 컴포즈를 작성해봅시다.

이전 게시글을 따라오셨다면, docker-compose.yml 파일은 아래와 같을 것입니다.

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
  	  - '--config.file=/etc/prometheus/prometheus.yml
  	restart: always
  	networks:
  	  - monitor-network
```

이제 services 섹터에 그라파나도 실행시키도록 추가해주어야합니다.

```yaml
grafana:
    image: grafana/grafana
    container_name: grafana
    depends_on:
      - prometheus
    ports:
      - "3000:3000"
    volumes:
      - ./grafana/grafana-volume:/var/lib/grafana
      - ./grafana/config/grafana-init.ini:/etc/grafana/grafana.ini
    restart: always
    networks:
      - goodjob-network
        
networks:
  goodjob-network:
    driver: bridge
```

이 중, 윗부분은 프로메테우스와 같으니 새로운 파트만 설명하면,

- depends_on: 그라파나가 프로메테우스에 의존한다는 것입니다. 즉 같은 도커 컴포즈 파일에서 관리될 때, 프로메테우스 컨테이너가 먼저 실행되고 그라파나가 실행되도록 합니다.

프로메테우스와 마찬가지로 볼륨을 정해주어야하는데, docker-compose.yml파일이 존재하는 디렉토리 (저는 monitor)에 grafana/config, grafana/grafana-volume 폴더를 각각 생성해줍니다.

그럼 이제 docker-compose.yml이 존재하는 폴더에서 ls 명령어를 실행하면,

docker-compose.yml    grafana    prometheus 이렇게 세가지 컨텐츠가 나오게 됩니다.

프로메테우스 설정 정보를 정의했던 prometheus.yml처럼, 그라파나의 설정 정보를 정의하기 위해 grafana-init.ini라는 파일을 config 폴더 내에 만들어줍니다.

저는 간단하게 아래와 같이 작성했습니다.

```
[server]
http_port = 3000
protocol = http
domain = 인스턴스 IP
root_url = %(protocol)s://%(domain)s:%(http_port)s/
```

> https를 사용하게 되면 SSL 인증에 관련된 작성을 해야한다고 합니다.

이제 그라파나에 관련된 설정도 모두 끝났습니다.

## 도커라이징

이제 docker-compose up -d 로 도커 컴포즈 파일로 컨테이너를 실행시켜봅시다.

그리고 docker ps 명령어로 실행중인 컨테이너를 확인했을 때,

![docker ps](/assets/img/2023-06-05-springboot-monitoring2/dockerimage.webp)

위와 같이 나온다면 성공한 것입니다. (docker ps -a 를 하면 종료된 컨테이너도 모두 출력됩니다.)


## 트러블 슈팅

### 프로메테우스 폴더 이슈

저는 프로메테우스를 실행시킬 때, /data/queries.active를 찾지 못했다는 오류가 발생했습니다.

prometheus.yml파일도 정상적으로 작성되었기 때문에 도커로 실행시키는 중 발생한 이슈인 것 같아서 볼륨을 설정했던 폴더로 들어가보았습니다.

그러나 프로메테우스를 실행시켰음에도 불구하고 볼륨으로 설정했던 /prometheus/prometheus-volume 는 빈 폴더였습니다.

그래서 이는 쓰기 권한이 없기떄문에 도커에서 파일을 생성하지 못하는 것으로 판단해서

```
sudo chown -R 0:0 prometheus/
```
명령어로 폴더에 대한 소유자를 root 권한으로 설정합니다.

```
sudo chmod -R 777 prometheus/
```
그리고 디렉토리의 쓰기, 읽기, 실행 권한을 모든 사용자에게 부여합니다.

그 결과 해결되었습니다.

### 그라파나 실행 파일 이슈

grafana-init.ini 파일 내의 내용을 작성할 때 마주한 이슈입니다.

저는 인스턴스 IP를 직접적으로 사용하지 않고, Nginx 프록시 매니저를 통해 https://www.waveofmymind.shop/ 이라는 경로로 프록시 설정을 해두었습니다.

그러나 protocol을 https로, domain을 www.waveofmymind.shop으로 했지만 그라파나가 실행되지 않았는데요.

protocol을 https로 사용할 경우에는 SSL 보안 문서에 대한 작업을 grafana-init.ini에 설정해야한다는 문제가 있었습니다.

그래서 저는 어차피 프록시 매니저에 의해 그라파나 url을 http://인스턴스IP:3000/로 설정하더라도 https://grafana.waveofmymind.shop/으로 변경해서 접속할 수 있기 때문에

protocol을 http로 변경하고, domain에 인스턴스 IP로 변경했습니다.

### TO-BE

현재 스프링 부트 프로젝트와 모니터링 관련 툴이 같은 도커 컨테이너에서 실행되고 있기 때문에

서버가 죽으면 모니터링 자체를 할 수 없는 역설적인 이슈가 발생합니다.

서버가 죽어도 죽었는지 모니터링을 해야하기 때문입니다.

추후, 모니터링용 인스턴스를 따로 두어 해당 인스턴스에서 모니터링 툴을 실행시키는게 좋을 방법인 것 같습니다.





