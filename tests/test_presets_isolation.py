# -*- coding: utf-8 -*-
"""验证: 方案(presets)按游戏隔离

v1.5.76 修的问题: presets.json 原来是扁平 {方案名: {...}}, 绝区零存的方案
在星铁那边原样可见、还能套用 —— 但两边 Mods 目录完全不同, 套过去只会把
星铁里 id 对不上的 mod 全禁掉。现在按游戏 key 分层存放。

跑法: python tests/test_presets_isolation.py
"""
import io
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 用临时数据目录, 别碰用户真实配置
TMP = tempfile.mkdtemp(prefix="mm_preset_test_")
os.environ["MOD_MANAGER_DATA"] = TMP
sys.path.insert(0, ROOT)

import zzmi_manager as Z  # noqa: E402

PASS, FAIL = [], []


def ck(name, cond, extra=None):
    (PASS if cond else FAIL).append(name)
    print(("  ok   " if cond else "  FAIL ") + name
          + ("" if extra is None else " | %s" % (extra,)))


def reset():
    if os.path.exists(Z.PRESETS_PATH):
        os.remove(Z.PRESETS_PATH)


print("=== 1. 空的方案表 ===")
reset()
ck("空文件 -> 整表为空", Z.presets_load() == {})
ck("空文件 -> zzmi 为空", Z.presets_load("zzmi") == {})
ck("空文件 -> srmi 为空", Z.presets_load("srmi") == {})

print()
print("=== 2. 存 zzmi 的方案, 不应出现在 srmi ===")
reset()
Z.presets_save({"绝区零方案": {"enabled": ["1aMOD/安比"], "total": 1, "saved": 1.0}}, "zzmi")
ck("zzmi 能读到自己的方案", list(Z.presets_load("zzmi").keys()) == ["绝区零方案"],
   list(Z.presets_load("zzmi").keys()))
ck("srmi 读不到 zzmi 的方案", Z.presets_load("srmi") == {},
   Z.presets_load("srmi"))
ck("整表里两层都在", set(Z.presets_load().keys()) == {"zzmi"},
   list(Z.presets_load().keys()))

print()
print("=== 3. 再存 srmi 的方案, 两边互不覆盖 ===")
Z.presets_save({"星铁方案": {"enabled": ["1aMOD/银狼998"], "total": 1, "saved": 2.0}}, "srmi")
ck("zzmi 仍只有自己的", list(Z.presets_load("zzmi").keys()) == ["绝区零方案"],
   list(Z.presets_load("zzmi").keys()))
ck("srmi 只有自己的", list(Z.presets_load("srmi").keys()) == ["星铁方案"],
   list(Z.presets_load("srmi").keys()))
raw = json.load(io.open(Z.PRESETS_PATH, encoding="utf-8"))
ck("磁盘结构是两层", set(raw.keys()) == {"zzmi", "srmi"}, list(raw.keys()))

print()
print("=== 4. 覆盖写某个游戏, 不动另一游戏 ===")
Z.presets_save({"绝区零方案2": {"enabled": [], "total": 0, "saved": 3.0}}, "zzmi")
ck("zzmi 被整层替换", list(Z.presets_load("zzmi").keys()) == ["绝区零方案2"],
   list(Z.presets_load("zzmi").keys()))
ck("srmi 未受影响", list(Z.presets_load("srmi").keys()) == ["星铁方案"],
   list(Z.presets_load("srmi").keys()))

print()
print("=== 5. 未配置游戏时不能落盘到错误位置 ===")
reset()
Z.presets_save({"无主方案": {"enabled": [], "total": 0, "saved": 4.0}}, "")
ck("空 game key 存进去后, zzmi 读不到", Z.presets_load("zzmi") == {},
   Z.presets_load("zzmi"))
ck("空 game key 存进去后, srmi 读不到", Z.presets_load("srmi") == {})

print()
print("=== 6. 老格式(扁平)不会被当成某个游戏的方案 ===")
reset()
old = {"旧方案A": {"enabled": ["x"], "total": 1, "saved": 5.0},
       "旧方案B": {"enabled": [], "total": 0, "saved": 6.0}}
io.open(Z.PRESETS_PATH, "w", encoding="utf-8").write(json.dumps(old, ensure_ascii=False))
ck("老格式下 zzmi 不会误读旧方案", Z.presets_load("zzmi") == {},
   Z.presets_load("zzmi"))
ck("老格式下 srmi 不会误读旧方案", Z.presets_load("srmi") == {})
ck("整表仍能看到旧数据(没删)", set(Z.presets_load().keys()) == {"旧方案A", "旧方案B"},
   list(Z.presets_load().keys()))
# 在新格式下存一次, 老键必须还在(不能一把清掉用户数据)
Z.presets_save({"新方案": {"enabled": [], "total": 0, "saved": 7.0}}, "zzmi")
raw = json.load(io.open(Z.PRESETS_PATH, encoding="utf-8"))
ck("新存不会删掉老键", "旧方案A" in raw and "旧方案B" in raw, list(raw.keys()))
ck("新存的 zzmi 方案能读到", list(Z.presets_load("zzmi").keys()) == ["新方案"],
   list(Z.presets_load("zzmi").keys()))

print()
print("=== 7. 损坏的文件不炸 ===")
reset()
io.open(Z.PRESETS_PATH, "w", encoding="utf-8").write("not a json {{{")
try:
    v = Z.presets_load("zzmi")
    ck("损坏文件不抛异常", True, repr(v))
except Exception as e:
    ck("损坏文件不抛异常", False, "抛了 %s" % e)

try:
    Z.presets_save({"x": {}}, "zzmi")
    ck("损坏文件下仍能写入", list(Z.presets_load("zzmi").keys()) == ["x"],
       list(Z.presets_load("zzmi").keys()))
except Exception as e:
    ck("损坏文件下仍能写入", False, "抛了 %s" % e)

reset()
try:
    os.rmdir(TMP)
except OSError:
    pass

print()
print("PASS %d / FAIL %d" % (len(PASS), len(FAIL)))
if FAIL:
    print("失败项:")
    for x in FAIL:
        print("  - " + x)
sys.exit(1 if FAIL else 0)
