import { NextResponse } from "next/server";
import { DATAPLANE_URL, getDataplaneHeaders } from "@/lib/hindsight-client";

const STATUS_TIMEOUT_MS = 3000;
const DEFAULT_RECOVERY_TIMEOUT_SECONDS = 120;

type DataplaneVersion = {
  instance_id?: string;
};

export async function POST() {
  try {
    const response = await fetch(`${DATAPLANE_URL}/v1/default/admin/restart`, {
      method: "POST",
      headers: getDataplaneHeaders(),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    const configuredTimeout = Number(process.env.HINDSIGHT_CP_RESTART_RECOVERY_TIMEOUT_SECONDS);
    const recoveryTimeoutSeconds =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_RECOVERY_TIMEOUT_SECONDS;

    return NextResponse.json({
      ...payload,
      recovery_timeout_seconds: recoveryTimeoutSeconds,
    });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Failed to request restart" },
      { status: 502 }
    );
  }
}

export async function GET(request: Request) {
  const previousInstanceId = new URL(request.url).searchParams.get("previousInstanceId");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(`${DATAPLANE_URL}/version`, {
      headers: getDataplaneHeaders(),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return NextResponse.json({ reachable: false, ready: false });
    }

    const version = (await response.json()) as DataplaneVersion;
    const instanceId = version.instance_id;
    return NextResponse.json({
      reachable: true,
      ready: Boolean(instanceId && previousInstanceId && instanceId !== previousInstanceId),
      instance_id: instanceId,
    });
  } catch {
    return NextResponse.json({ reachable: false, ready: false });
  } finally {
    clearTimeout(timeout);
  }
}
