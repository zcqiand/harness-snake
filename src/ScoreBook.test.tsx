/** ScoreBook「回放最近一局」入口按当前 tab 皮肤点亮——录像 skinId ≠ tab 皮肤须 disabled。静态 SSR 渲染断言（零新增依赖，react-dom/server 现成）。 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ScoreBook from "./ScoreBook";
import { DEFAULT_SKIN_ID, getSkin } from "./config/skins";
import { createRecording, type Recording } from "./lib/recorder";

const recWithSkin = (skinId: string): Recording => createRecording(skinId, 0);

/** 渲染并抽出「回放最近一局」按钮的整段 HTML（disabled 属性在开标签上）。 */
function replayButtonHtml(lastRun: Recording | null, selectedSkinId: string): string {
  const html = renderToStaticMarkup(
    <ScoreBook
      scores={[]}
      skin={getSkin(selectedSkinId)}
      lastRun={lastRun}
      onReplayLast={() => {}}
      onClose={() => {}}
    />,
  );
  const at = html.indexOf("回放最近一局");
  expect(at).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf("<button", at);
  const end = html.indexOf("</button>", at);
  return html.slice(start, end + "</button>".length);
}

describe("ScoreBook 回放最近一局入口", () => {
  it("录像 skinId ≠ 当前 tab 皮肤 → disabled", () => {
    // 默认 tab = dashcam；录像来自 handheld → 不得点亮
    expect(replayButtonHtml(recWithSkin("handheld"), DEFAULT_SKIN_ID)).toContain(' disabled=""');
  });

  it("录像 skinId = 当前 tab 皮肤 → enabled（无 disabled 属性）", () => {
    expect(replayButtonHtml(recWithSkin(DEFAULT_SKIN_ID), DEFAULT_SKIN_ID)).not.toContain(' disabled=""');
  });

  it("lastRun null → disabled（原有语义保持）", () => {
    expect(replayButtonHtml(null, DEFAULT_SKIN_ID)).toContain(' disabled=""');
  });

  it("所选皮肤=handheld 时首 tab 仍是 dashcam——handheld 录像 ≠ tab 皮肤 → disabled（回归主案）", () => {
    // 回归点：全局最近一局是 handheld，但打开的 tab 是 dashcam（tabIdx 初始 0）
    expect(replayButtonHtml(recWithSkin("handheld"), "handheld")).toContain(' disabled=""');
  });

  it("所选皮肤=handheld 时 tab 切到 dashcam 段——dashcam 录像 = tab 皮肤 → enabled", () => {
    expect(replayButtonHtml(recWithSkin(DEFAULT_SKIN_ID), "handheld")).not.toContain(' disabled=""');
  });
});
