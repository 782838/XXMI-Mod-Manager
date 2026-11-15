# -*- coding: utf-8 -*-
"""验证: 「被占用」与「没权限」不再被错判

用户截图反馈(v1.5.79):
  弹窗标题「禁用失败, 得手动来一下」, 正文第一句却是
  「这个 mod 当前没有权限改名(可能被设成只读, 或被杀毒软件锁着)」,
  但真实原因往往只是**资源管理器开着那个文件夹**。

根因: lock_reason_kind() 原来**先判 denied 再判 busy**, 而 busy 的文案里本来就会提
到「杀软」(杀软扫盘也是占用来源之一), 于是被 "杀软" 命中 -> 错判成 denied。
"""
import io
import os
import sys
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, r"D:\Agent通用工作区\MOD管理器任务\zzmi-manager")
import zzmi_manager as Z  # noqa: E402

PASS, FAIL = [], []


def ck(name, cond, extra=None):
    (PASS if cond else FAIL).append(name)
    print(("  ok   " if cond else "  FAIL ") + name
          + ("" if extra is None else " | %s" % (extra,)))


print("=== 1. 真实占用场景（持有文件句柄） ===")
d = tempfile.mkdtemp()
sub = os.path.join(d, "locked_test")
os.makedirs(sub)
f = os.path.join(sub, "hold.bin")
open(f, "w").write("x")
h = os.open(f, os.O_RDONLY)
try:
    ok, why = Z.lock_reason(sub)
    kind = Z.lock_reason_kind(why)
    print("   lock_reason  ->", repr(why))
    print("   kind         ->", kind)
    ck("占用时 lock_reason 判定为 False", ok is False)
    ck("占用时 kind 是 busy（不再是 denied）", kind == "busy", kind)
    ck("占用文案里提到资源管理器", "资源管理器" in why, why[:40])
finally:
    os.close(h)
    import shutil
    shutil.rmtree(d, ignore_errors=True)

print()
print("=== 2. 各类文案的归类 ===")
CASES = [
    # (文案, 期望 kind, 说明)
    ("里面的文件「a.ini」正被别的程序占用(最常见是资源管理器开着这个目录, 其次杀软; 游戏还开着也有可能)",
     "busy", "典型占用(含「杀软」字样, 不能误判 denied)"),
    ("文件被占用 —— 最常见是资源管理器开着这个目录(含预览窗格)或杀毒软件在扫; 其次是游戏还开着。",
     "busy", "file_toggle 的占用文案"),
    ("文件被占用 —— 最常见是资源管理器开着那个文件夹(含预览窗格)或杀毒软件在扫; 其次是游戏正在用它。",
     "busy", "另一处占用文案"),
    ("被占用(资源管理器开着这个目录最常见, 其次杀软/游戏), 关掉再试",
     "busy", "move 的占用文案"),
    ("这个文件夹正被占用 —— 先关掉资源管理器里开着它的窗口(或游戏)再试",
     "busy", "0x74 文案"),
    ("重命名失败: [WinError 5] 拒绝访问。",
     "denied", "纯权限问题"),
    ("这个文件夹是只读的, 没有权限改名",
     "denied", "只读"),
    ("因为「X」已被占用, 自动改名为「X (2)」",
     "other", "成功消息(重名自动加后缀), 不能弹手动教程"),
    ("未知错误摆烂",
     "other", "无法归类"),
]
for msg, want, note in CASES:
    got = Z.lock_reason_kind(msg)
    ck("%s -> %s" % (note, want), got == want, "实际 %s" % got)

print()
print("=== 3. 弹窗文案的归因（不再说「先关游戏」） ===")
ui = io.open(r"D:\Agent通用工作区\MOD管理器任务\zzmi-manager\ui.html",
             encoding="utf-8").read()
ck("弹窗不再写「先把游戏关掉再操作」", "先把游戏关掉再操作" not in ui)
ck("弹窗提示先关资源管理器", "关掉开着这个文件夹的资源管理器窗口" in ui)
ck("busy 说明把资源管理器排在第一位",
   ui.find("资源管理器开着这个文件夹") < ui.find("游戏/3DMigoto 还开着")
   if "游戏/3DMigoto 还开着" in ui else True)
ck("英文侧也改了", "close the game first" not in ui)

print()
print("PASS %d / FAIL %d" % (len(PASS), len(FAIL)))
if FAIL:
    for x in FAIL:
        print("  - " + x)
sys.exit(1 if FAIL else 0)
