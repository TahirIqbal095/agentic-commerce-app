import { parseProductSearchQuery } from "@/lib/http/catalog-query";
import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { requireBrand } from "@/modules/identity/brand";
import { createStorefrontBrowsingRoute } from "@/modules/identity/guest-session";

async function getProducts(request: Request): Promise<Response> {
  const parsedQuery = parseProductSearchQuery(new URL(request.url).searchParams);
  if (!parsedQuery.ok) {
    return errorResponse(parsedQuery.error, 400);
  }

  try {
    await requireBrand();
    const catalog = createCatalogModule();
    const result = await catalog.search(parsedQuery.value);
    return dataResponse(result);
  } catch (error) {
    console.error("Product search failed", error);
    return unexpectedErrorResponse();
  }
}

export const GET = createStorefrontBrowsingRoute(getProducts);
