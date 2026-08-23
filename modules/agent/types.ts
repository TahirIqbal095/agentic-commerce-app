import { CatalogProduct } from "../catalog/types";

export type AgentMessage = {
  message: string;
};

export type AgentResponse = {
  message: string;
  products: CatalogProduct[];
};
