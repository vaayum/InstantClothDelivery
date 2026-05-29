import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("customer_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function saveSession(token: string, userId: string): Promise<void> {
  await AsyncStorage.multiSet([["customer_token", token], ["customer_user_id", userId]]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove(["customer_token", "customer_user_id"]);
}

export async function getUserId(): Promise<string | null> {
  return AsyncStorage.getItem("customer_user_id");
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem("customer_token");
}
