"""Browser acceptance tests; all non-loopback requests are intercepted."""
import json
import os
import re
import tempfile
import threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright, expect

ROOT = Path("public").resolve()
OUT = Path(os.environ.get("RUNNER_TEMP", ".")) / "pages-browser-report.json"
results = []
blocked = set()
remote = {"other": {"name":"toby-stock-workspace-v1-other.json","data":{
    "version":1,"stocks":[{"code":"QA99","name":"隔離測試遠端股","sector":"半導體","priority":False,"note":"fixture"}],
    "journals":{},"meta":{"stockTimes":{"QA99":1},"tombstones":{},"journalTimes":{}}}}}
writes = []
bad_remote = False

def respond(route, payload, status=200):
    route.fulfill(status=status, content_type="application/json", body=json.dumps(payload),
                  headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS"})

def route_request(route):
    req = route.request
    url = req.url
    from urllib.parse import urlparse
    u = urlparse(url)
    if u.scheme == "http" and u.hostname == "127.0.0.1" and u.port == PORT:
        route.continue_()
    elif url.startswith("https://accounts.google.com/gsi/client"):
        route.fulfill(content_type="application/javascript", body="window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>o.callback({access_token:'isolated-test-token',expires_in:3600})})}}};")
    elif u.hostname == "www.googleapis.com" and "/drive/v3/files" in u.path:
        if req.method == "OPTIONS":
            respond(route, {})
        elif req.method == "GET" and u.path == "/drive/v3/files":
            respond(route, {"files":[{"id":k,"name":v["name"],"modifiedTime":"2026-11-26T00:00:00Z"} for k,v in remote.items()]})
        elif req.method == "GET":
            key = u.path.rsplit("/",1)[-1]
            respond(route, {"version":-1} if bad_remote and key=="other" else remote[key]["data"])
        elif req.method in ("POST","PATCH") and u.path.startswith("/upload/"):
            body = req.post_data or ""
            if req.method == "POST":
                metadata = re.search(r'\{"name":"toby-stock-workspace-v1-[^"]+"[^}]+\}', body)
                snapshot = re.search(r'\{"version":1,"deviceId":.*?(?=\r?\n--)', body, re.S)
                assert metadata and snapshot, "Missing mock multipart payload"
                name = json.loads(metadata.group())["name"]
                data = json.loads(snapshot.group())
                key = "test-" + str(len(remote))
            else:
                key = u.path.rsplit("/",1)[-1]
                name = remote[key]["name"]
                data = json.loads(body)
            remote[key] = {"name":name,"data":data}
            writes.append({"method":req.method,"id":key})
            respond(route, {"id":key,"name":name,"modifiedTime":"2026-11-26T00:00:00Z"})
        else:
            respond(route, {"error":"unexpected mock request"}, 400)
    else:
        blocked.add(u.hostname or "(other)")
        route.abort()

def stock(page):
    global bad_remote
    page.goto(BASE+"pages/stocks.html")
    expect(page.locator("#stkWatchRows")).to_contain_text("南亞科")
    page.locator('[data-edit="2408"]').first.click()
    page.locator("#stkEditName").fill("南亞科 QA")
    page.locator("#stkEditNote").fill("測試備註")
    page.locator("#stkEditSave").click()
    expect(page.locator("#stkWatchRows")).to_contain_text("南亞科 QA")
    page.reload()
    expect(page.locator("#stkWatchRows")).to_contain_text("南亞科 QA")
    page.locator("#stkCloudClientId").fill("isolated-test.apps.googleusercontent.com")
    page.locator("#stkCloudConnect").click()
    expect(page.locator("#stkCloudStatus")).to_contain_text("雲端同步完成",timeout=20000)
    expect(page.locator("#stkWatchRows")).to_contain_text("隔離測試遠端股")
    assert len(writes)==1 and writes[0]["method"]=="POST"
    saved=remote[writes[0]["id"]]["data"]
    assert any(s["code"]=="2408" and s["name"]=="南亞科 QA" for s in saved["stocks"])
    assert any(s["code"]=="QA99" for s in saved["stocks"])
    page.locator('[data-edit="2408"]').first.click()
    page.locator("#stkEditNote").fill("更新測試備註")
    page.locator("#stkEditSave").click()
    page.wait_for_function("document.querySelector('#stkCloudSync').disabled === false")
    page.locator("#stkCloudSync").click()
    expect(page.locator("#stkCloudStatus")).to_contain_text("雲端同步完成",timeout=20000)
    assert any(w["method"]=="PATCH" for w in writes)
    before = len(writes)
    bad_remote=True
    page.locator("#stkCloudSync").click()
    expect(page.locator("#stkCloudStatus")).to_contain_text("已停止合併",timeout=20000)
    assert len(writes)==before
    expect(page.locator("#stkWatchRows")).to_contain_text("南亞科 QA")
    page.locator("#stkCloudDisconnect").click()
    expect(page.locator("#stkCloudStatus")).to_contain_text("本機已結束連線")
    return {"mock_writes":writes, "invalid_remote_stopped_write":True, "real_oauth":False}

def english(page):
    page.add_init_script("""(() => {
      const play=HTMLMediaElement.prototype.play;
      window.__media=[];
      HTMLMediaElement.prototype.play=function(){
        const self=this;return play.call(this).then(v=>{window.__media.push({src:self.currentSrc,rate:self.playbackRate});return v;});
      };
    })();""")
    page.goto(BASE+"pages/english-learning-island-practice.html")
    expect(page.locator("#siteStatus")).to_contain_text("已連接原版")
    page.locator('[data-view="all"]').click()
    page.locator("#q").fill("light")
    page.locator('#wordList [data-id="w026"]').click()
    expect(page.locator("#wordTitle")).to_have_text("light")
    page.locator("#voiceLocale").select_option("en-US")
    page.locator("#wordSpeak").click()
    page.wait_for_function("window.__media.some(m=>m.src.endsWith('/light.mp3')&&m.rate===1)")
    page.locator("#wordSlow").click()
    page.wait_for_function("window.__media.some(m=>m.src.endsWith('/light.mp3')&&m.rate===0.75)")
    page.locator("#recordStart").click()
    expect(page.locator("#recordStop")).to_be_enabled()
    page.wait_for_timeout(1200)
    page.locator("#recordStop").click()
    expect(page.locator("#recordAudio")).to_be_visible()
    page.evaluate("document.getElementById('recordAudio').play()")
    page.wait_for_function("window.__media.some(m=>m.src.startsWith('blob:'))")
    page.locator("#favToggle").click()
    expect(page.locator("#favToggle")).to_contain_text("已收藏")
    page.locator("#markLearned").click()
    page.reload()
    expect(page.locator("#siteStatus")).to_contain_text("已連接原版")
    expect(page.locator("#learnedCount")).to_have_text("1")
    expect(page.locator("#favCount")).to_have_text("1")
    return {"mp3":True,"practice_slow_rate":0.75,"virtual_microphone_record_and_play":True,"persistence":True}

def search(page):
    page.goto(BASE)
    page.locator("#q").fill("金溪里")
    expect(page.locator("#command-hint")).to_contain_text("找到",timeout=15000)
    result=page.locator("#command-results .command-option").filter(has_text="啟動器內容").filter(has_text="金溪里").first
    expect(result).to_be_visible(timeout=15000)
    target=result.locator("strong").inner_text()
    result.click()
    page.wait_for_url("**/pages/**")
    assert page.url.startswith(BASE)
    assert "jinxi" in page.url, page.url
    return {"result":target,"local_destination":page.url.split("/")[-1]}

def gouache(page):
    dataset=json.loads((ROOT/"data/gouache/products.json").read_text())
    page.goto(BASE+"pages/gouache-products.html")
    expect(page.locator("#status")).to_contain_text(f"{len(dataset)} / {len(dataset)}")
    assert page.locator("#grid article").count()==36
    page.locator("#next").click()
    expect(page.locator("#page")).to_contain_text("第 2")
    page.locator("#prev").click()
    page.locator("#category").select_option(dataset[0]["category"])
    page.locator("#group").select_option(dataset[0]["newName"].strip())
    page.locator("#search").fill("覆盆子紅")
    expect(page.locator("#grid article").first).to_be_visible()
    page.locator("#grid article button").first.click()
    expect(page.locator("#detail")).to_be_visible()
    expect(page.locator("#detailBody")).to_contain_text("覆盆子紅")
    expect(page.locator("#detailBody")).to_contain_text("20g")
    with page.expect_popup() as pop:
        page.locator("#detailBody a").filter(has_text="開啟產品 HTML").click()
    detail=pop.value
    expect(detail.locator("h1")).to_contain_text("覆盆子紅")
    for img in detail.locator(".gallery img").all():
        img.scroll_into_view_if_needed()
        expect(img).to_be_visible()
    detail.wait_for_function("Array.from(document.querySelectorAll('.gallery img')).length===5 && Array.from(document.querySelectorAll('.gallery img')).every(i=>i.complete&&i.naturalWidth>0)")
    detail.close()
    page.locator("#close").click()
    page.goto(BASE+"pages/gouache-product-detail.html?row=3")
    expect(page.locator("#title")).to_have_text("覆盆子紅7號")
    for img in page.locator("#gallery img").all():
        img.scroll_into_view_if_needed()
    page.wait_for_function("document.querySelectorAll('#gallery img').length===5 && Array.from(document.querySelectorAll('#gallery img')).every(i=>i.complete&&i.naturalWidth>0)")
    return {"product_count":len(dataset),"catalog_filter":True,"static_detail_images":5,"dynamic_detail_images":5}

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

with tempfile.TemporaryDirectory() as temp:
    (Path(temp)/"personal-os-static-git").symlink_to(ROOT,target_is_directory=True)
    server=ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=temp))
    PORT=server.server_port
    BASE=f"http://127.0.0.1:{PORT}/personal-os-static-git/"
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"])
            for fn in (stock,english,search,gouache):
                context=browser.new_context(permissions=["microphone"],service_workers="block")
                context.route("**/*",route_request)
                page=context.new_page()
                page.set_default_timeout(15000)
                try:
                    result=fn(page)
                    results.append({"case":fn.__name__,"status":"pass","details":result})
                    print("PASS",fn.__name__,json.dumps(result,ensure_ascii=False),flush=True)
                except Exception as exc:
                    results.append({"case":fn.__name__,"status":"fail","error":str(exc)})
                    print("FAIL",fn.__name__,str(exc),flush=True)
                finally:
                    context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        OUT.write_text(json.dumps({"results":results,"blocked_external_hosts":sorted(blocked)},ensure_ascii=False,indent=2))
assert len(results)==4 and all(x["status"]=="pass" for x in results), "Browser acceptance has failures"
