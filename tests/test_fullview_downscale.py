# -*- coding: utf-8 -*-
"""验证「放大看大图」的降采样

用户实测反馈(v1.5.80):
  「有些时候加载不出来 需要点详情换了图才能放大查看」
后端实测: 41 个有图的 mod, full=1 全部返回 200 —— 不是后端炸了。
真正的问题是大图**原样直出**: 几 MB 的图浏览器解码慢得像卡住, 超 30MB 直接 413 空白。

本测试验证 _full_view_path():
  · 大图 (>900KB 且 >1600px) -> 降采样到 1600px, 体积大幅下降
  · 小图 / 小尺寸 -> 原样返回(不损失细节)
  · 没装 Pillow / 读不出来 -> 回退原图(绝不因为这一步让图打不开)
  · 同一张图第二次走缓存, 不重复生成
"""
import io
import os
import random
import shutil
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


Image = Z._get_pil()
if not Image:
    print("!! 环境缺 Pillow, 跳过")
    sys.exit(0)

D = tempfile.mkdtemp(prefix="mm_fullview_")
h = Z.Handler.__new__(Z.Handler)
h.app = type("A", (), {})()


def noisy(w, hh, path, q=95):
    """造一张压不掉的噪点图(纯色图压缩后太小, 测不出效果)"""
    im = Image.new("RGB", (w, hh))
    px = im.load()
    random.seed(7)
    for y in range(0, hh, 3):
        for x in range(0, w, 3):
            px[x, y] = (random.randint(0, 255), random.randint(0, 255),
                        random.randint(0, 255))
    im.save(path, "JPEG", quality=q)
    return path


print("=== 1. 大图应降采样 ===")
big = noisy(4000, 3000, os.path.join(D, "big.jpg"))
sz0 = os.path.getsize(big)
out = h._full_view_path(big)
sz1 = os.path.getsize(out) if os.path.isfile(out) else 0
with Image.open(out) as im:
    ow, oh = im.size
print("   原图 %.2f MB 4000x3000 -> %.2f MB %dx%d"
      % (sz0 / 1048576, sz1 / 1048576, ow, oh))
ck("大图被换成缓存文件（不再是原路径）", out != big)
ck("降采样后长边 = 1600", max(ow, oh) == Z.LB_FULL_MAX_PX, "%dx%d" % (ow, oh))
ck("体积显著下降（至少 3 倍）", sz1 * 3 < sz0, "%.2f->%.2f MB" % (sz0 / 1048576, sz1 / 1048576))
ck("降采样后仍是能打开的图片", sz1 > 0 and max(ow, oh) == 1600)

print()
print("=== 2. 同一张图第二次走缓存 ===")
out2 = h._full_view_path(big)
ck("第二次返回同一路径", out2 == out, os.path.basename(out2))
mt1 = os.path.getmtime(out)
import time
time.sleep(0.05)
h._full_view_path(big)
ck("没有重复生成（mtime 未变）", os.path.getmtime(out) == mt1)

print()
print("=== 3. 小图 / 小尺寸应原样直出 ===")
small = noisy(700, 500, os.path.join(D, "small.jpg"))
ck("尺寸小于 1600 的图原样返回", h._full_view_path(small) == small)

# 尺寸大但压得很小(纯色) -> 原图直出, 不必折腾
flat = os.path.join(D, "flat.png")
Image.new("RGB", (4000, 3000), (30, 30, 30)).save(flat)
ck("体积小（<=900KB）的大尺寸图原样返回", h._full_view_path(flat) == flat,
   "%.0f KB" % (os.path.getsize(flat) / 1024))

print()
print("=== 4. 异常输入不能炸 ===")
try:
    r = h._full_view_path(os.path.join(D, "not-exist.png"))
    ck("不存在的文件不抛异常", True, repr(r))
except Exception as e:
    ck("不存在的文件不抛异常", False, "抛了 %s" % e)

bad = os.path.join(D, "broken.jpg")
open(bad, "wb").write(b"not an image at all" * 100)
try:
    r = h._full_view_path(bad)
    ck("损坏文件不抛异常（回退原图）", r == bad, os.path.basename(r))
except Exception as e:
    ck("损坏文件不抛异常（回退原图）", False, "抛了 %s" % e)

print()
print("=== 5. 常量配置合理 ===")
ck("LB_FULL_MAX_PX 存在且 >= 1024", getattr(Z, "LB_FULL_MAX_PX", 0) >= 1024,
   getattr(Z, "LB_FULL_MAX_PX", None))
ck("FULL_VIEW_DIR 与 thumbs 分开", Z.FULL_VIEW_DIR != Z.THUMB_DIR,
   os.path.basename(Z.FULL_VIEW_DIR))
ck("降采样尺寸远大于卡片缩略图", Z.LB_FULL_MAX_PX > Z.THUMB_PX * 2,
   "%d vs %d" % (Z.LB_FULL_MAX_PX, Z.THUMB_PX))

shutil.rmtree(D, ignore_errors=True)
print()
print("PASS %d / FAIL %d" % (len(PASS), len(FAIL)))
if FAIL:
    for x in FAIL:
        print("  - " + x)
sys.exit(1 if FAIL else 0)
