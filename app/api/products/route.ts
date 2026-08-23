import { parseProductSearchQuery } from "@/lib/http/catalog-query";
import {
  dataResponse,
  errorResponse,
  unexpectedErrorResponse,
} from "@/lib/http/responses";
import { createCatalogModule } from "@/modules/catalog/catalog";
import { resolveMerchantContext } from "@/modules/identity/merchant-context";

export async function GET(request: Request): Promise<Response> {
  const parsedQuery = parseProductSearchQuery(new URL(request.url).searchParams);
  if (!parsedQuery.ok) {
    return errorResponse(parsedQuery.error, 400);
  }

  try {
    const { merchantId } = await resolveMerchantContext();
    const catalog = createCatalogModule(merchantId);
    const result = await catalog.search(parsedQuery.value);
    return dataResponse(result);
  } catch (error) {
    console.error("Product search failed", error);
    return unexpectedErrorResponse();
  }
}
