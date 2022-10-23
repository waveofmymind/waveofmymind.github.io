---
title: DFS and BFS
date: 2021-06-11 20:30:00 +0900
categories: [Algorithm]
tags: [algorithm, bfs, dfs, python, boj]
img_path: /assets/img/
---

[1260번: DFS와 BFS](https://www.acmicpc.net/problem/1260)

![DFS and BFS](DFS.png)

## 🤔 생각해보기

DFS와 BFS의 기본 개념을 익히기 위한 문제다.

자바에서는 2차원 배열로 edge 들을 설정한 뒤에 해결했었는데 파이썬에서 딕셔너리를 활용하여 풀어보았다. 개인적으로는 2차원 배열이 가독성이 끔찍하다고 느껴져서인지 어려워하는 편인데 딕셔너리를 활용해보니 이해하기도 편하고 훨씬 쉽게 해결 할 수 있는 것 같다.

## 성공 코드

```python
from collections import deque
from collections import defaultdict

# stack 으로 구현
def dfs(g, r):
    stack = [r]
    visited = []

    while stack:
        n = stack.pop()
        if n not in visited:
            visited.append(n)
            temp = list(set(g[n]) - set(visited))
            # 작은 것부터 방문하기 위해 뒤에서부터 꺼내는 스택의 특성을 고려하여 내림차순으로 정렬 후 기존 스택에 추가.
            temp.sort(reverse=True)
            stack += temp

    return visited

# deque 로 구현
def bfs(g, r):
    queue = deque([r])
    visited = []

    while queue:
        n = queue.popleft()
        if n not in visited:
            visited.append(n)
            temp = list(set(g[n]) - set(visited))
            # 앞에서부터 꺼내는 특성을 고려하여 오름차순으로 정렬 후 기존 deque 에 추가.
            temp.sort()
            queue += temp

    return visited

N, M, V = map(int, input().split())

graph = defaultdict(list)
for _ in range(M):
    n1, n2 = map(int, input().split())

    # 양방향 그래프
    if n1 not in graph:
        graph[n1] = [n2]
    elif n2 not in graph[n1]:
        graph[n1].append(n2)

    if n2 not in graph:
        graph[n2] = [n1]
    elif n1 not in graph[n2]:
        graph[n2].append(n1)

print(*dfs(graph, V))
print(*bfs(graph, V))
```

- `defaultdict(list)` : 딕셔너리에 없는 키를 호출할 때 생기는 KeyError 를 해결하기 위해 사용
