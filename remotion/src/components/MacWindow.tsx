import React from "react";
import { GITHUB_DARK } from "../lib/colors";

interface MacWindowProps {
  children: React.ReactNode;
  title?: string;
  width?: number;
  style?: React.CSSProperties;
}

export const MacWindow: React.FC<MacWindowProps> = ({
  children,
  title = "vbcdr",
  width = 1400,
  style,
}) => {
  const trafficLights = ["#ff5f57", "#febc2e", "#28c840"];

  return (
    <div
      style={{
        width,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
        border: `1px solid ${GITHUB_DARK.bg700}`,
        ...style,
      }}
    >
      <div
        style={{
          height: 40,
          backgroundColor: GITHUB_DARK.bg900,
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          gap: 8,
        }}
      >
        {trafficLights.map((color, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              backgroundColor: color,
            }}
          />
        ))}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 13,
            color: GITHUB_DARK.fgMuted,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            marginRight: 52,
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ backgroundColor: GITHUB_DARK.bg950 }}>{children}</div>
    </div>
  );
};
