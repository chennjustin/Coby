import { NextRequest, NextResponse } from "next/server";
import { LineMessagingClient } from "@/lib/line/client";
import { RICH_MENU_CONFIG } from "@/lib/line/rich-menu";
import { Logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * 設定 Rich Menu
 * POST /api/rich-menu/setup
 * 
 * 注意：此 API 需要先準備一張 2500x1686 的 PNG 圖片
 * 圖片應該分成四個區域，對應四個按鈕
 */
export async function POST(request: NextRequest) {
  try {
    const lineClient = new LineMessagingClient();

    // 取得現有的 Rich Menu 列表
    const existingMenus = await lineClient.getRichMenuList();
    
    // 刪除所有現有的 Rich Menu
    for (const menu of existingMenus) {
      try {
        await lineClient.deleteRichMenu(menu.richMenuId);
        Logger.info("Deleted existing Rich Menu", { richMenuId: menu.richMenuId });
      } catch (error) {
        Logger.warn("Failed to delete existing Rich Menu", { error, richMenuId: menu.richMenuId });
      }
    }

    // 建立新的 Rich Menu
    const richMenuId = await lineClient.createRichMenu(RICH_MENU_CONFIG);
    Logger.info("Rich Menu created", { richMenuId });

    // 檢查是否有提供圖片
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

    if (imageFile) {
      // 將圖片轉換為 Buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      
      // 上傳圖片
      await lineClient.uploadRichMenuImage(richMenuId, imageBuffer);
      Logger.info("Rich Menu image uploaded", { richMenuId });
    } else {
      Logger.warn("No image provided for Rich Menu", { richMenuId });
      return NextResponse.json(
        {
          success: true,
          richMenuId,
          message: "Rich Menu created but no image uploaded. Please upload image separately.",
        },
        { status: 200 }
      );
    }

    // 設定為預設 Rich Menu
    await lineClient.setDefaultRichMenu(richMenuId);
    Logger.info("Default Rich Menu set", { richMenuId });

    return NextResponse.json({
      success: true,
      richMenuId,
      message: "Rich Menu setup completed successfully",
    });
  } catch (error) {
    Logger.error("Failed to setup Rich Menu", { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * 取得 Rich Menu 設定資訊
 * GET /api/rich-menu/setup
 */
export async function GET() {
  try {
    const lineClient = new LineMessagingClient();
    const menus = await lineClient.getRichMenuList();

    return NextResponse.json({
      success: true,
      richMenus: menus,
      config: RICH_MENU_CONFIG,
    });
  } catch (error) {
    Logger.error("Failed to get Rich Menu info", { error });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

