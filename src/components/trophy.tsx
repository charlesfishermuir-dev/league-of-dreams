"use client";

import { useEffect, useRef, useState } from "react";

export type Engraving = { year: number; team: string };

/*
 * The League of Dreams trophy: a gold cup on a silver barrel whose plates carry
 * every champion's year and team name. three.js is loaded only in the browser,
 * so it never slows the server render. Drag sideways to spin it; vertical drags
 * still scroll the page on phones.
 */
export function Trophy({ champions }: { champions: Engraving[] }) {
  const mount = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      const fontFamily = getComputedStyle(document.body).getPropertyValue("--font-oswald").trim() || "Arial Narrow";
      await Promise.all(["700 80px", "600 40px"].map((f) => document.fonts.load(`${f} ${fontFamily}`).catch(() => null)));
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setState("failed");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = "pan-y";
      renderer.domElement.style.cursor = "grab";

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 3.5, 12.5);
      camera.lookAt(0, 3.05, 0);

      const key = new THREE.DirectionalLight(0xfff3d6, 2.2);
      key.position.set(4, 8, 6);
      const rim = new THREE.DirectionalLight(0x8fb0ff, 1.4);
      rim.position.set(-6, 4, -5);
      const fill = new THREE.DirectionalLight(0xff5a6a, 0.5);
      fill.position.set(6, 1, -4);
      scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.15));

      const trophy = new THREE.Group();
      scene.add(trophy);
      const disposables: { dispose(): void }[] = [envTexture, pmrem];
      const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

      const gold = keep(new THREE.MeshStandardMaterial({ color: 0xe0b23a, metalness: 1, roughness: 0.16 }));
      const lacquer = keep(new THREE.MeshStandardMaterial({ color: 0x0b0f1e, metalness: 0.2, roughness: 0.25 }));
      const add = (geo: import("three").BufferGeometry, mat: import("three").Material, y = 0) => {
        const m = new THREE.Mesh(keep(geo), mat);
        m.position.y = y;
        trophy.add(m);
        return m;
      };

      // ---- Engraved champion plates around the barrel ----
      const ROWS = 4;
      const COLS = Math.max(6, Math.ceil((champions.length + 1) / ROWS)); // always room for next year's name
      const TW = 4096, TH = 1024;
      const plates = document.createElement("canvas");
      plates.width = TW;
      plates.height = TH;
      const bump = document.createElement("canvas");
      bump.width = TW;
      bump.height = TH;
      const pc = plates.getContext("2d")!;
      const bc = bump.getContext("2d")!;
      // Brushed silver.
      pc.fillStyle = "#c9ced6";
      pc.fillRect(0, 0, TW, TH);
      for (let i = 0; i < 2600; i++) {
        pc.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "70,76,90"},${Math.random() * 0.08})`;
        pc.fillRect(Math.random() * TW, Math.random() * TH, 120 + Math.random() * 500, 1 + Math.random() * 2);
      }
      bc.fillStyle = "#fff";
      bc.fillRect(0, 0, TW, TH);

      const cw = TW / COLS, rh = TH / ROWS;
      const latest = champions.at(-1)?.year;
      const fit = (ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number) => {
        let s = size;
        do ctx.font = `${weight} ${s--}px ${fontFamily}`;
        while (ctx.measureText(text).width > maxW && s > 18);
      };
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const x = c * cw, y = r * rh, pad = 14;
          // Plate seams (grooves), also cut into the bump map.
          for (const ctx of [pc, bc]) {
            ctx.strokeStyle = ctx === pc ? "rgba(40,44,56,0.55)" : "#444";
            ctx.lineWidth = 5;
            ctx.strokeRect(x + pad, y + pad, cw - 2 * pad, rh - 2 * pad);
          }
          const champ = champions[c * ROWS + r];
          if (!champ) continue;
          const isLatest = champ.year === latest;
          if (isLatest) {
            pc.fillStyle = "rgba(240,190,60,0.45)";
            pc.fillRect(x + pad + 3, y + pad + 3, cw - 2 * pad - 6, rh - 2 * pad - 6);
          }
          const team = champ.team.toUpperCase();
          const cx = x + cw / 2;
          for (const ctx of [pc, bc]) {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const ink = ctx === pc ? (isLatest ? "#4a3206" : "#262a34") : "#000";
            const shine = ctx === pc ? "rgba(255,255,255,0.7)" : null;
            const lines: [string, number, number, number][] = [
              [String(champ.year), 700, 100, y + rh * 0.37],
              [team, 600, 64, y + rh * 0.74],
            ];
            for (const [text, weight, size, ty] of lines) {
              fit(ctx, text, weight, size, cw - 2 * pad - 30);
              if (shine) { // lit lower edge of the cut, so it reads as engraved
                ctx.fillStyle = shine;
                ctx.fillText(text, cx + 1.5, ty + 2.5);
              }
              ctx.fillStyle = ink;
              ctx.fillText(text, cx, ty);
            }
          }
        }
      }
      const plateMap = keep(new THREE.CanvasTexture(plates));
      plateMap.colorSpace = THREE.SRGBColorSpace;
      plateMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const bumpMap = keep(new THREE.CanvasTexture(bump));
      const silver = keep(new THREE.MeshStandardMaterial({ map: plateMap, bumpMap, bumpScale: 2.5, metalness: 0.9, roughness: 0.32 }));

      const R = 1.3;
      const barrelH = (2 * Math.PI * R * TH) / TW; // keeps the lettering in proportion
      add(new THREE.CylinderGeometry(1.55, 1.6, 0.32, 96), lacquer, 0.16);
      add(new THREE.TorusGeometry(1.4, 0.05, 16, 96).rotateX(Math.PI / 2), gold, 0.34);
      const barrelY = 0.36 + barrelH / 2;
      add(new THREE.CylinderGeometry(R, R, barrelH, 128, 1, true), silver, barrelY);
      add(new THREE.CylinderGeometry(R - 0.02, R - 0.02, barrelH, 64), lacquer, barrelY); // closes the ends
      const top = 0.36 + barrelH;
      add(new THREE.TorusGeometry(R + 0.02, 0.05, 16, 96).rotateX(Math.PI / 2), gold, top);
      add(new THREE.CylinderGeometry(0.95, 1.25, 0.3, 96), lacquer, top + 0.17);

      // League name band on the upper tier.
      const band = document.createElement("canvas");
      band.width = 2048;
      band.height = 92; // matches the band's shape, so letters aren't stretched
      const bx = band.getContext("2d")!;
      bx.fillStyle = "#0b0f1e";
      bx.fillRect(0, 0, 2048, 92);
      bx.textAlign = "center";
      bx.textBaseline = "middle";
      bx.fillStyle = "#e9c04f";
      // Twice around the band; each copy must fit its half or they overlap where they meet.
      const motto = "LEAGUE OF DREAMS  ★  CHAMPIONS  ★  EST. 2007  ★";
      fit(bx, motto, 700, 58, 980);
      for (let i = 0; i < 2; i++) bx.fillText(motto, 512 + i * 1024, 48);
      const bandMap = keep(new THREE.CanvasTexture(band));
      bandMap.colorSpace = THREE.SRGBColorSpace;
      const bandMat = keep(new THREE.MeshStandardMaterial({ map: bandMap, metalness: 0.5, roughness: 0.3 }));
      add(new THREE.CylinderGeometry(0.92, 0.92, 0.26, 96, 1, true), bandMat, top + 0.45);
      add(new THREE.TorusGeometry(0.92, 0.035, 12, 96).rotateX(Math.PI / 2), gold, top + 0.59);

      // The cup: one turned profile (foot, stem, knot, bowl, rolled lip, inside).
      const cupBase = top + 0.6;
      const P = (x: number, y: number) => new THREE.Vector2(x, y);
      const profile = [
        P(0, 0), P(0.62, 0), P(0.64, 0.06), P(0.5, 0.14), P(0.24, 0.32), P(0.15, 0.6), P(0.24, 0.72),
        P(0.27, 0.8), P(0.18, 0.9), P(0.14, 1.05), P(0.24, 1.2), P(0.5, 1.4), P(0.78, 1.72), P(0.93, 2.08),
        P(0.98, 2.4), P(1.04, 2.52), P(1.0, 2.56), P(0.92, 2.45), P(0.86, 2.1), P(0.7, 1.75), P(0.3, 1.45), P(0, 1.42),
      ];
      add(new THREE.LatheGeometry(profile, 128), gold, cupBase);
      // Handles: a loop from just under the rim out and down to the side of the bowl.
      const handles: import("three").Mesh[] = [];
      for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3(
          [[0.9, 2.28], [1.3, 2.36], [1.52, 2.1], [1.42, 1.78], [1.0, 1.56], [0.6, 1.47]]
            .map(([x, y]) => new THREE.Vector3(side * x, cupBase + y, 0)),
        );
        handles.push(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 64, 0.065, 16)), gold));
        trophy.add(handles.at(-1)!);
      }

      // A baseball resting in the cup.
      const ball = document.createElement("canvas");
      ball.width = 1024;
      ball.height = 512;
      const bl = ball.getContext("2d")!;
      bl.fillStyle = "#f3efe4";
      bl.fillRect(0, 0, 1024, 512);
      bl.strokeStyle = "#c8102e";
      bl.lineWidth = 5;
      for (const phase of [0, Math.PI]) {
        for (const off of [-9, 9]) { // the double row of stitches
          bl.setLineDash([10, 9]);
          bl.beginPath();
          for (let u = 0; u <= 1024; u += 4) {
            const v = 256 + Math.sin((u / 1024) * Math.PI * 2 * 2 + phase) * 120 * (phase ? -1 : 1);
            if (u === 0) bl.moveTo(u, v + off);
            else bl.lineTo(u, v + off);
          }
          bl.stroke();
        }
      }
      const ballMap = keep(new THREE.CanvasTexture(ball));
      ballMap.colorSpace = THREE.SRGBColorSpace;
      const ballMesh = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.5, 64, 32)),
        keep(new THREE.MeshStandardMaterial({ map: ballMap, roughness: 0.6, metalness: 0 })),
      );
      ballMesh.position.y = cupBase + 2.5;
      ballMesh.rotation.set(0.9, 0.6, 1.1);
      trophy.add(ballMesh);

      // Soft shadow under the base.
      const shadow = document.createElement("canvas");
      shadow.width = shadow.height = 256;
      const sx = shadow.getContext("2d")!;
      const g = sx.createRadialGradient(128, 128, 10, 128, 128, 128);
      g.addColorStop(0, "rgba(0,0,0,0.65)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      sx.fillStyle = g;
      sx.fillRect(0, 0, 256, 256);
      const shadowMesh = new THREE.Mesh(
        keep(new THREE.PlaneGeometry(5, 5)),
        keep(new THREE.MeshBasicMaterial({ map: keep(new THREE.CanvasTexture(shadow)), transparent: true, depthWrite: false })),
      );
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.y = 0.001;
      scene.add(shadowMesh);

      // Start with the newest champion facing front. Plate column c sits at angle (c + 0.5) / COLS around the barrel.
      const latestIdx = champions.length - 1;
      let angle = latestIdx >= 0 ? -2 * Math.PI * ((Math.floor(latestIdx / ROWS) + 0.5) / COLS) : 0;
      handles.forEach((m) => (m.rotation.y = -angle)); // handles to the sides when the newest plate faces front
      let velocity = 0;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const idleSpin = reduceMotion ? 0 : 0.0025;

      // Drag to spin.
      let dragging = false, lastX = 0, lastT = 0, idleAfter = 0;
      const canvas = renderer.domElement;
      const down = (e: PointerEvent) => {
        dragging = true;
        lastX = e.clientX;
        lastT = performance.now();
        velocity = 0;
        canvas.style.cursor = "grabbing";
      };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - lastX, now = performance.now();
        angle += dx * 0.008;
        velocity = (dx * 0.008) / Math.max(1, now - lastT) * 16;
        lastX = e.clientX;
        lastT = now;
      };
      const up = () => {
        if (!dragging) return;
        dragging = false;
        idleAfter = performance.now() + 2500;
        canvas.style.cursor = "grab";
      };
      canvas.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        // Narrow screens: back the camera off so the whole trophy fits.
        camera.position.z = w / h < 0.8 ? 12.5 / (w / h / 0.8) : 12.5;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // Only animate while on screen.
      let visible = true, frame = 0;
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(tick);
      });
      io.observe(el);
      function tick() {
        frame = 0;
        if (!dragging) {
          angle += velocity;
          velocity *= 0.95;
          if (Math.abs(velocity) < 0.0004 && performance.now() > idleAfter) angle += idleSpin;
        }
        trophy.rotation.y = angle;
        renderer.render(scene, camera);
        if (visible) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
      setState("ready");

      cleanup = () => {
        cancelAnimationFrame(frame);
        io.disconnect();
        ro.disconnect();
        canvas.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        canvas.remove();
      };
    })().catch(() => setState("failed"));

    return () => {
      disposed = true;
      cleanup();
    };
  }, [champions]);

  return (
    <div className="relative h-full w-full">
      <div ref={mount} className="absolute inset-0" role="img" aria-label="The League of Dreams trophy, engraved with every champion" />
      {state !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center text-7xl" aria-hidden>
          {state === "loading" ? <span className="animate-pulse">🏆</span> : "🏆"}
        </div>
      )}
      <ul className="sr-only">
        {champions.map((c) => <li key={c.year}>{c.year}: {c.team}</li>)}
      </ul>
    </div>
  );
}
