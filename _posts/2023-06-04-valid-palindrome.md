---
title: "[LeetCode] valid-palindrome"
date: 2023-06-04 10:12:00 +0900
aliases: 
tags: [알고리즘,리트코드,LeetCode,NeetCode 150,Algorithm,알고리즘]
categories: [Algorithm]
---

## 문제 링크

[valid palindrome](https://leetcode.com/problems/valid-palindrome/)

## 문제 설명

입력으로 주어지는 문자열에서 공백과 따옴표를 제거하고, 대문자인 경우 모두 소문자로 변경합니다.

그리고 양 끝이 다를 경우 False, 모두 같을 경우 True를 반환하는 문제입니다.

## 코드

```python
class Solution:
    def isPalindrome(self, s: str) -> bool:
        s = s.lower()
        arr = [i for i in s if i.isdigit() or i.isalpha()]
        
        if len(arr) == 0:
            return True
        else:
            lt = 0
            rt = len(arr)-1
            while lt < rt:
                if arr[lt] != arr[rt]:
                    return False
                lt += 1
                rt -= 1
            return True
```

## 접근한 풀이 방법

- 우선 입력 문자열을 모두 소문자로 변경해줍니다.

- 그리고 문제에서 문자에는 영숫자라고 했으니, 입력 문자가 숫자이거나 알파벳일 경우 arr 리스트에 담아줍니다.
저는 리스트 컴프리헨션을 사용했습니다.

- 만약 arr의 길이가 0이면 빈 문자열이므로 True를 반환해줍니다.

- arr의 길이가 있을 경우, 투 포인터 알고리즘을 사용해야합니다. lt를 문자열 왼쪽 끝, rt를 문자열의 오른쪽 끝으로 초기화하고, while문을 통해 반복해서 arr[lt]와 arr[rt]를 비교해줍니다.

- while문의 종료 조건은 lt가 rt보다 커지는 경우나, 만약 arr[lt]와 arr[rt]가 다를 경우입니다.

- while문이 모두 종료되었을 경우 비교가 다 끝났기 때문에 입력 문자열이 valid palindrome인 경우이므로 True를 리턴해줍니다.




