---
title: "스프링에서 로그 수집을 위한 AWS CloudWatch 적용기"
date: 2023-06-14 21:29:00 +0900
aliases: 
tags: [AWS,AWS CloudWatch,Log,Spring Boot,Spring]
categories: [Spring]
---

![AWS Cloudwatch](/assets/img/2023-06-14-aws-cloudwatch/cloudwatch.webp)

팀 프로젝트 진행중 효율적으로 작업을 하기 위해 AWS CloudWatch를 Spring Boot 프로젝트에 적용했던 것을 공유하는 글입니다.

## AS-IS: 셀프 체크 로깅

팀 프로젝트를 진행 중, 팀장으로써 팀원들이 개발을 할 때 편하게 했으면 좋겠다는 생각이 들어 개발 서버에 대해 CI/CD 구축을 하게 되었습니다.

그러나 문제는 이제 시작이였는데요.

이전 프로젝트에서는 백엔드가 저 혼자였기때문에 로그를 확인할 필요가 있을 경우, 서버에 접속해서 로그를 확인했었습니다.

그러나 이번엔 백엔드 개발자가 여럿인 만큼 각자의 개발 상황에 따라 서버에서 로그를 찍어볼 일이 **매우매우매우** 많았던 것입니다.

저는 NCP의 크레딧을 이용해서 서버를 이용하고 있었기 떄문에, 직접 서버에 접속하는 것은 저만 가능한 일이였습니다.

pem 키나 접속 비밀번호를 공유하는 것도 한 방법이 될 수 있지만, 다른 서버에서도 같은 pem 키를 사용하고 있었고, 보안상 누출하는 것이 좋지 않다고 생각했습니다.

그 결과, 다음과 같은 이슈가 있었습니다.

> 이슈가 있는 것 같은데, 로그를 확인해주실 수 있을까요?
>
> 저 방금 특정 API를 요청했는데, 500 에러가 발생해요.

등의 메시지가 오면 도커에서 로그를 찍어보거나, 같이 코드를 살펴본 후 로컬 환경에서 재연해보고 문제를 해결해야 했습니다.

그 중에서는 로컬에서는 문제가 없지만 개발 서버에서 발생하는 문제도 여럿 있었고,

이럴때 제가 자리에 없을 경우 다른 팀원들은 문제가 발생해도 하던 일을 멈추고 다른 일을 하거나 기다리는 시간이 생기게 되어 컨텍스트 스위칭이 발생하는 것입니다.

이러한 일이 반복되자 팀 프로젝트를 진행하는데 있어서 비효율적이라고 생각했습니다.

그래서 저는 logback을 사용하면 로그 파일을 저장하는 것 외에도 AWS CloudWatch를 통해 콘솔에서 로그를 확인할 수 있다는 방법에 대해 알게되었습니다. 

그리고 ReadOnly IAM 계정을 생성해서 팀원들에게 공유하면, 문제가 발생할 때마다 자유롭게 로그를 확인해 볼 수 있을 것이라고 생각해서 AWS CloudWatch를 적용하게 되었습니다.

## 준비 사항

스프링 부트에 의존성을 추가해줍니다.

```java
// AWS CloudWatch appender
implementation'ca.pjer:logback-awslogs-appender:1.6.0'
```
### logback-spring.xml

그리고 logback-spring.xml 파일은, 원래 logback.xml으로 사용했지만 spring을 붙이면 프로파일마다 커스텀할 수 있습니다.

저는 아래와 같이 사용하고 있었는데요.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration packagingData="true">
    <timestamp key="timestamp" datePattern="yyyy-MM-dd-HH-mm-ssSSS"/>

    <property name="CONSOLE_LOG_PATTERN" value="%highlight(%-5level) %date [%thread] %cyan([%C{0} :: %M :: %L]) - %msg%n"/>

    <appender name="console_log" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="ch.qos.logback.classic.encoder.PatternLayoutEncoder">
            <pattern>${CONSOLE_LOG_PATTERN}</pattern>
        </encoder>
    </appender>

    <springProfile name="local">
        <root level="INFO">
            <appender-ref ref="console_log"/>
        </root>
    </springProfile>

    <springProfile name="dev">
        <root level="DEBUG">
            <appender-ref ref="console_log"/>
        </root>
    </springProfile>
</configuration>
```

장점으로는 실행되는 프로파일에 따라 로그 레벨을 조정할 수도, appender를 달리 적용할 수도 있습니다.

제 기준에서는 local 프로파일에는 콘솔에 INFO 레벨 이상으로 로그가 찍히고,

dev 프로파일에서는 콘솔 창에 DEBUG 레벨부터 콘솔에 로그가 찍히게 됩니다.

로그가 어떻게 뜰 지는 중간에 appender 태그에 name="console_log"를 수정하면 됩니다.

### AWS Cloudwatch appender 추가

이제 CloudWatch로 로그를 보내기 위해 appender를 정의해줍시다.

```xml
	<appender name="aws_cloud_watch_log" class="ca.pjer.logback.AwsLogsAppender">
        <layout>
            <pattern>[%thread] [%date] [%level] [%file:%line] - %msg%n</pattern>
        </layout>
        <logGroupName>로그 그룹명</logGroupName>
        <logStreamUuidPrefix>로그 스트림 UUID predix</logStreamUuidPrefix>
        <logRegion>ap-northeast-2</logRegion>
        <maxBatchLogEvents>50</maxBatchLogEvents>
        <maxFlushTimeMillis>30000</maxFlushTimeMillis>
        <maxBlockTimeMillis>5000</maxBlockTimeMillis>
        <retentionTimeDays>0</retentionTimeDays>
        <accessKeyId>엑세스 키 값</accessKeyId>
        <secretAccessKey>시크릿 키 값</secretAccessKey>
    </appender>
```

각 태그별로 간단하게 설명을 하자면

- logGroupName: 클라우드 워치 내에서 로그 그룹을 정의합니다.
- logSteamUuidPreFix: 제가 많이 헷갈렸던 부분인데요. 제가 클라우드 워치에서 직접 로그스트림을 생성하면 지정 이름 + UUID로 생성이 되어 지정 이름을 입력하는 식으로 적용이 되는 줄 알았지만, 로그 스트림이 생성될 때 지정 이름 + UUID로 생성되기 떄문에 제가 predix를 지정하는 것이였습니다.
- maxBatchLogEvents: 한번에 전송할 수 있는 최대 로그 이벤트의 수를 지정합니다.
- maxFlushTimeMillis: 로그 이벤트 배치가 전송되기 전에 대기할 수 있는 최대 시간을 밀리초 단위로 지정합니다. 예를 들어, 이 값이 30000(30초)으로 설정되어 있으면, 로그 이벤트가 쌓여있더라도 30초가 지나면 해당 로그 이벤트들이 전송됩니다.
- retentionTimeDays: 로그가 저장될 시간을 의미합니다.
- maxBlockTimeMillis: 배치 작업을 하기 전에 내부 버퍼가 가득 찼을 때 기다리는 시간을 정의합니다. 

따라서 위와 같이 설정하면 로그가 50개 쌓이면 클라우드 워치로 전송이 되는데, 만약 로그가 50개 쌓이지 않더라도 30초가 지나도 클라우드 워치로 전송되게 됩니다.

이제 설정은 다 끝났습니다.

## TO-BE

저는 로그백을 아래와 같이

local 프로필은 콘솔에서, prod에서만 클라우드 워치로 전송하도록 했습니다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration packagingData="true">
    <timestamp key="timestamp" datePattern="yyyy-MM-dd-HH-mm-ssSSS"/>

    <appender name="aws_cloud_watch_log" class="ca.pjer.logback.AwsLogsAppender">
        <layout>
            <pattern>[%thread] [%date] [%level] [%file:%line] - %msg%n</pattern>
        </layout>
        <logGroupName>goodjob</logGroupName>
        <logStreamUuidPrefix>goodjob-log</logStreamUuidPrefix>
        <logRegion>ap-northeast-2</logRegion>
        <maxBatchLogEvents>50</maxBatchLogEvents>
        <maxFlushTimeMillis>30000</maxFlushTimeMillis>
        <maxBlockTimeMillis>5000</maxBlockTimeMillis>
        <retentionTimeDays>0</retentionTimeDays>
        <accessKeyId>${AWS_ACCESS_KEY}</accessKeyId>경
        <secretAccessKey>${AWS_SECRET_KEY}</secretAccessKey>
    </appender>

    <property name="CONSOLE_LOG_PATTERN" value="%highlight(%-5level) %date [%thread] %cyan([%C{0} :: %M :: %L]) - %msg%n"/>
    <appender name="console_log" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="ch.qos.logback.classic.encoder.PatternLayoutEncoder">
            <pattern>${CONSOLE_LOG_PATTERN}</pattern>
        </encoder>
    </appender>

    <springProfile name="local">
        <root level="INFO">
            <appender-ref ref="console_log"/>
        </root>
    </springProfile>

    <springProfile name="prod">
        <root level="INFO">
            <appender-ref ref="aws_cloud_watch_log"/>
        </root>
    </springProfile>
</configuration>
```

이제 Cloudwatch에 들어가보면 아래와 같이 로그가 찍히고 있음을 볼 수 있습니다.

![result](/assets/img/2023-06-14-aws-cloudwatch/result.webp)

NCP에 배포한 서버의 로그가 콘솔에 잘 찍히고 있습니다.

## 결론

로컬 환경에서 충분히 테스트 했더라도 배포 서버에서는 미처 고려하지 못한 문제가 발생할 수 있습니다.

이때 로그를 효율적으로 관리하기 위해 위와 같이 로그 관리 방법을 고려한다면, 앞으로 문제가 발생하더라도 애플리케이션의 상황을 더 잘 파악할 수 있을 것 같습니다.








