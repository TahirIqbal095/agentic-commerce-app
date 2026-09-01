import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import { isUuid } from "@/lib/validation";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { requireBrand } from "@/modules/identity/brand";
import { createStorefrontBrowsingRoute } from "@/modules/identity/guest-session";

async function getProduct(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await context.params;
  if (!isUuid(productId)) {
    return errorResponse(
      {
        code: "PRODUCT_NOT_FOUND",
        message: "The requested product was not found.",
        details: {},
      },
      404,
    );
  }

  try {
    await requireBrand();
    const catalog = createCatalogModule();
    const result = await catalog.getProduct(productId);

    if (!result.ok) {
      return errorResponse(result.error, 404);
    }

    return dataResponse(result.value);
  } catch (error) {
    console.error("Product lookup failed", error);
    return unexpectedErrorResponse();
  }
}

export const GET = createStorefrontBrowsingRoute(getProduct);
