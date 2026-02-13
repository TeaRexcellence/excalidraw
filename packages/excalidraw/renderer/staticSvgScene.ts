import {
  FRAME_STYLE,
  MAX_DECIMALS_FOR_SVG_EXPORT,
  SVG_NS,
  THEME,
  getFontFamilyString,
  isRTL,
  isTestEnv,
  getVerticalOffset,
  applyDarkModeFilter,
} from "@excalidraw/common";
import { normalizeLink, toValidURL } from "@excalidraw/common";
import { hashString } from "@excalidraw/element";
import { getUncroppedWidthAndHeight } from "@excalidraw/element";
import {
  createPlaceholderEmbeddableLabel,
  getEmbedLink,
} from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import { getBoundTextElement, getContainerElement } from "@excalidraw/element";
import { getLineHeightInPx } from "@excalidraw/element";
import {
  isArrowElement,
  isIframeLikeElement,
  isInitializedImageElement,
  isTextElement,
} from "@excalidraw/element";

import { getContainingFrame } from "@excalidraw/element";

import { getCornerRadius, isPathALoop } from "@excalidraw/element";

import { ShapeCache } from "@excalidraw/element";

import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElementWithContainer,
  ExcalidrawCodeBlockElement,
  ExcalidrawDocumentElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { RenderableElementsMap, SVGRenderConfig } from "../scene/types";
import type { AppState, BinaryFiles } from "../types";
import type { Drawable } from "roughjs/bin/core";
import type { RoughSVG } from "roughjs/bin/svg";

const roughSVGDrawWithPrecision = (
  rsvg: RoughSVG,
  drawable: Drawable,
  precision?: number,
) => {
  if (typeof precision === "undefined") {
    return rsvg.draw(drawable);
  }
  const pshape: Drawable = {
    sets: drawable.sets,
    shape: drawable.shape,
    options: { ...drawable.options, fixedDecimalPlaceDigits: precision },
  };
  return rsvg.draw(pshape);
};

const maybeWrapNodesInFrameClipPath = (
  element: NonDeletedExcalidrawElement,
  root: SVGElement,
  nodes: SVGElement[],
  frameRendering: AppState["frameRendering"],
  elementsMap: RenderableElementsMap,
) => {
  if (!frameRendering.enabled || !frameRendering.clip) {
    return null;
  }
  const frame = getContainingFrame(element, elementsMap);
  if (frame) {
    const g = root.ownerDocument.createElementNS(SVG_NS, "g");
    g.setAttributeNS(SVG_NS, "clip-path", `url(#${frame.id})`);
    nodes.forEach((node) => g.appendChild(node));
    return g;
  }

  return null;
};

const renderElementToSvg = (
  element: NonDeletedExcalidrawElement,
  elementsMap: RenderableElementsMap,
  rsvg: RoughSVG,
  svgRoot: SVGElement,
  files: BinaryFiles,
  offsetX: number,
  offsetY: number,
  renderConfig: SVGRenderConfig,
) => {
  const offset = { x: offsetX, y: offsetY };
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  let cx = (x2 - x1) / 2 - (element.x - x1);
  let cy = (y2 - y1) / 2 - (element.y - y1);
  if (isTextElement(element)) {
    const container = getContainerElement(element, elementsMap);
    if (isArrowElement(container)) {
      const [x1, y1, x2, y2] = getElementAbsoluteCoords(container, elementsMap);

      const boundTextCoords = LinearElementEditor.getBoundTextElementPosition(
        container,
        element as ExcalidrawTextElementWithContainer,
        elementsMap,
      );
      cx = (x2 - x1) / 2 - (boundTextCoords.x - x1);
      cy = (y2 - y1) / 2 - (boundTextCoords.y - y1);
      offsetX = offsetX + boundTextCoords.x - element.x;
      offsetY = offsetY + boundTextCoords.y - element.y;
    }
  }
  const degree = (180 * element.angle) / Math.PI;

  // element to append node to, most of the time svgRoot
  let root = svgRoot;

  // if the element has a link, create an anchor tag and make that the new root
  if (element.link) {
    const anchorTag = svgRoot.ownerDocument.createElementNS(SVG_NS, "a");
    anchorTag.setAttribute("href", normalizeLink(element.link));
    root.appendChild(anchorTag);
    root = anchorTag;
  }

  const addToRoot = (node: SVGElement, element: ExcalidrawElement) => {
    if (isTestEnv()) {
      node.setAttribute("data-id", element.id);
    }
    root.appendChild(node);
  };

  const opacity =
    ((getContainingFrame(element, elementsMap)?.opacity ?? 100) *
      element.opacity) /
    10000;

  switch (element.type) {
    case "selection": {
      // Since this is used only during editing experience, which is canvas based,
      // this should not happen
      throw new Error("Selection rendering is not supported for SVG");
    }
    case "rectangle":
    case "diamond":
    case "ellipse": {
      const shape = ShapeCache.generateElementShape(element, renderConfig);
      const node = roughSVGDrawWithPrecision(
        rsvg,
        shape,
        MAX_DECIMALS_FOR_SVG_EXPORT,
      );
      if (opacity !== 1) {
        node.setAttribute("stroke-opacity", `${opacity}`);
        node.setAttribute("fill-opacity", `${opacity}`);
      }
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );

      const g = maybeWrapNodesInFrameClipPath(
        element,
        root,
        [node],
        renderConfig.frameRendering,
        elementsMap,
      );

      addToRoot(g || node, element);
      break;
    }
    case "iframe":
    case "embeddable": {
      // Check for video thumbnail first
      const videoThumbnailDataUrl = renderConfig.videoThumbnails?.get(
        element.id,
      );
      if (videoThumbnailDataUrl) {
        // Render video thumbnail as <image> element
        const image = svgRoot.ownerDocument.createElementNS(SVG_NS, "image");
        image.setAttribute("href", videoThumbnailDataUrl);
        // Set x/y attributes for proper positioning (required for SVG image elements)
        image.setAttribute("x", "0");
        image.setAttribute("y", "0");
        image.setAttribute("width", `${element.width}`);
        image.setAttribute("height", `${element.height}`);
        image.setAttribute("preserveAspectRatio", "none");

        const thumbnailOpacity = element.opacity / 100;
        if (thumbnailOpacity !== 1) {
          image.setAttribute("opacity", `${thumbnailOpacity}`);
        }

        image.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );

        const g = maybeWrapNodesInFrameClipPath(
          element,
          root,
          [image],
          renderConfig.frameRendering,
          elementsMap,
        );

        addToRoot(g || image, element);
        break;
      }

      // render placeholder rectangle
      const shape = ShapeCache.generateElementShape(element, renderConfig);
      const node = roughSVGDrawWithPrecision(
        rsvg,
        shape,
        MAX_DECIMALS_FOR_SVG_EXPORT,
      );
      const opacity = element.opacity / 100;
      if (opacity !== 1) {
        node.setAttribute("stroke-opacity", `${opacity}`);
        node.setAttribute("fill-opacity", `${opacity}`);
      }
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );
      addToRoot(node, element);

      const label: ExcalidrawElement =
        createPlaceholderEmbeddableLabel(element);
      renderElementToSvg(
        label,
        elementsMap,
        rsvg,
        root,
        files,
        label.x + offset.x - element.x,
        label.y + offset.y - element.y,
        renderConfig,
      );

      // render embeddable element + iframe
      const embeddableNode = roughSVGDrawWithPrecision(
        rsvg,
        shape,
        MAX_DECIMALS_FOR_SVG_EXPORT,
      );
      embeddableNode.setAttribute("stroke-linecap", "round");
      embeddableNode.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );
      while (embeddableNode.firstChild) {
        embeddableNode.removeChild(embeddableNode.firstChild);
      }
      const radius = getCornerRadius(
        Math.min(element.width, element.height),
        element,
      );

      const embedLink = getEmbedLink(toValidURL(element.link || ""));

      // if rendering embeddables explicitly disabled or
      // embedding documents via srcdoc (which doesn't seem to work for SVGs)
      // replace with a link instead
      if (
        renderConfig.renderEmbeddables === false ||
        embedLink?.type === "document"
      ) {
        const anchorTag = svgRoot.ownerDocument.createElementNS(SVG_NS, "a");
        anchorTag.setAttribute("href", normalizeLink(element.link || ""));
        anchorTag.setAttribute("target", "_blank");
        anchorTag.setAttribute("rel", "noopener noreferrer");
        anchorTag.style.borderRadius = `${radius}px`;

        embeddableNode.appendChild(anchorTag);
      } else {
        const foreignObject = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "foreignObject",
        );
        foreignObject.style.width = `${element.width}px`;
        foreignObject.style.height = `${element.height}px`;
        foreignObject.style.border = "none";
        const div = foreignObject.ownerDocument.createElementNS(SVG_NS, "div");
        div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
        div.style.width = "100%";
        div.style.height = "100%";
        const iframe = div.ownerDocument.createElement("iframe");
        iframe.src = embedLink?.link ?? "";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.style.border = "none";
        iframe.style.borderRadius = `${radius}px`;
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.allowFullscreen = true;
        div.appendChild(iframe);
        foreignObject.appendChild(div);

        embeddableNode.appendChild(foreignObject);
      }
      addToRoot(embeddableNode, element);
      break;
    }
    case "line":
    case "arrow": {
      const boundText = getBoundTextElement(element, elementsMap);
      const maskPath = svgRoot.ownerDocument.createElementNS(SVG_NS, "mask");
      if (boundText) {
        maskPath.setAttribute("id", `mask-${element.id}`);
        const maskRectVisible = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "rect",
        );
        offsetX = offsetX || 0;
        offsetY = offsetY || 0;
        maskRectVisible.setAttribute("x", "0");
        maskRectVisible.setAttribute("y", "0");
        maskRectVisible.setAttribute("fill", "#fff");
        maskRectVisible.setAttribute(
          "width",
          `${element.width + 100 + offsetX}`,
        );
        maskRectVisible.setAttribute(
          "height",
          `${element.height + 100 + offsetY}`,
        );

        maskPath.appendChild(maskRectVisible);
        const maskRectInvisible = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "rect",
        );
        const boundTextCoords = LinearElementEditor.getBoundTextElementPosition(
          element,
          boundText,
          elementsMap,
        );

        const maskX = offsetX + boundTextCoords.x - element.x;
        const maskY = offsetY + boundTextCoords.y - element.y;

        maskRectInvisible.setAttribute("x", maskX.toString());
        maskRectInvisible.setAttribute("y", maskY.toString());
        maskRectInvisible.setAttribute("fill", "#000");
        maskRectInvisible.setAttribute("width", `${boundText.width}`);
        maskRectInvisible.setAttribute("height", `${boundText.height}`);
        maskRectInvisible.setAttribute("opacity", "1");
        maskPath.appendChild(maskRectInvisible);
      }
      const group = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
      if (boundText) {
        group.setAttribute("mask", `url(#mask-${element.id})`);
      }
      group.setAttribute("stroke-linecap", "round");

      const shapes = ShapeCache.generateElementShape(element, renderConfig);
      shapes.forEach((shape) => {
        const node = roughSVGDrawWithPrecision(
          rsvg,
          shape,
          MAX_DECIMALS_FOR_SVG_EXPORT,
        );
        if (opacity !== 1) {
          node.setAttribute("stroke-opacity", `${opacity}`);
          node.setAttribute("fill-opacity", `${opacity}`);
        }
        node.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );
        if (
          element.type === "line" &&
          isPathALoop(element.points) &&
          element.backgroundColor !== "transparent"
        ) {
          node.setAttribute("fill-rule", "evenodd");
        }
        group.appendChild(node);
      });

      const g = maybeWrapNodesInFrameClipPath(
        element,
        root,
        [group, maskPath],
        renderConfig.frameRendering,
        elementsMap,
      );
      if (g) {
        addToRoot(g, element);
        root.appendChild(g);
      } else {
        addToRoot(group, element);
        root.append(maskPath);
      }
      break;
    }
    case "freedraw": {
      const wrapper = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");

      const shapes = ShapeCache.generateElementShape(element, renderConfig);
      // always ordered as [background, stroke]
      for (const shape of shapes) {
        if (typeof shape === "string") {
          // stroke (SVGPathString)

          const path = svgRoot.ownerDocument.createElementNS(SVG_NS, "path");
          path.setAttribute(
            "fill",
            renderConfig.theme === THEME.DARK
              ? applyDarkModeFilter(element.strokeColor)
              : element.strokeColor,
          );
          path.setAttribute("d", shape);
          wrapper.appendChild(path);
        } else {
          // background (Drawable)

          const bgNode = roughSVGDrawWithPrecision(
            rsvg,
            shape,
            MAX_DECIMALS_FOR_SVG_EXPORT,
          );

          // if children wrapped in <g>, unwrap it
          if (bgNode.nodeName === "g") {
            while (bgNode.firstChild) {
              wrapper.appendChild(bgNode.firstChild);
            }
          } else {
            wrapper.appendChild(bgNode);
          }
        }
      }
      if (opacity !== 1) {
        wrapper.setAttribute("stroke-opacity", `${opacity}`);
        wrapper.setAttribute("fill-opacity", `${opacity}`);
      }
      wrapper.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${
          offsetY || 0
        }) rotate(${degree} ${cx} ${cy})`,
      );
      wrapper.setAttribute("stroke", "none");

      const g = maybeWrapNodesInFrameClipPath(
        element,
        root,
        [wrapper],
        renderConfig.frameRendering,
        elementsMap,
      );

      addToRoot(g || wrapper, element);
      break;
    }
    case "image": {
      const width = Math.round(element.width);
      const height = Math.round(element.height);
      const fileData =
        isInitializedImageElement(element) && files[element.fileId];
      if (fileData) {
        const { reuseImages = true } = renderConfig;

        let symbolId = `image-${fileData.id}`;

        let uncroppedWidth = element.width;
        let uncroppedHeight = element.height;
        if (element.crop) {
          ({ width: uncroppedWidth, height: uncroppedHeight } =
            getUncroppedWidthAndHeight(element));

          symbolId = `image-crop-${fileData.id}-${hashString(
            `${uncroppedWidth}x${uncroppedHeight}`,
          )}`;
        }

        if (!reuseImages) {
          symbolId = `image-${element.id}`;
        }

        let symbol = svgRoot.querySelector(`#${symbolId}`);
        if (!symbol) {
          symbol = svgRoot.ownerDocument.createElementNS(SVG_NS, "symbol");
          symbol.id = symbolId;

          const image = svgRoot.ownerDocument.createElementNS(SVG_NS, "image");
          image.setAttribute("href", fileData.dataURL);
          image.setAttribute("preserveAspectRatio", "none");

          if (element.crop || !reuseImages) {
            image.setAttribute("width", `${uncroppedWidth}`);
            image.setAttribute("height", `${uncroppedHeight}`);
          } else {
            image.setAttribute("width", "100%");
            image.setAttribute("height", "100%");
          }

          symbol.appendChild(image);

          (root.querySelector("defs") || root).prepend(symbol);
        }

        const use = svgRoot.ownerDocument.createElementNS(SVG_NS, "use");
        use.setAttribute("href", `#${symbolId}`);

        let normalizedCropX = 0;
        let normalizedCropY = 0;

        if (element.crop) {
          const { width: uncroppedWidth, height: uncroppedHeight } =
            getUncroppedWidthAndHeight(element);
          normalizedCropX =
            element.crop.x / (element.crop.naturalWidth / uncroppedWidth);
          normalizedCropY =
            element.crop.y / (element.crop.naturalHeight / uncroppedHeight);
        }

        const adjustedCenterX = cx + normalizedCropX;
        const adjustedCenterY = cy + normalizedCropY;

        use.setAttribute("width", `${width + normalizedCropX}`);
        use.setAttribute("height", `${height + normalizedCropY}`);
        use.setAttribute("opacity", `${opacity}`);

        // We first apply `scale` transforms (horizontal/vertical mirroring)
        // on the <use> element, then apply translation and rotation
        // on the <g> element which wraps the <use>.
        // Doing this separately is a quick hack to to work around compositing
        // the transformations correctly (the transform-origin was not being
        // applied correctly).
        if (element.scale[0] !== 1 || element.scale[1] !== 1) {
          use.setAttribute(
            "transform",
            `translate(${adjustedCenterX} ${adjustedCenterY}) scale(${
              element.scale[0]
            } ${
              element.scale[1]
            }) translate(${-adjustedCenterX} ${-adjustedCenterY})`,
          );
        }

        const g = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");

        if (element.crop) {
          const mask = svgRoot.ownerDocument.createElementNS(SVG_NS, "mask");
          mask.setAttribute("id", `mask-image-crop-${element.id}`);
          mask.setAttribute("fill", "#fff");
          const maskRect = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "rect",
          );

          maskRect.setAttribute("x", `${normalizedCropX}`);
          maskRect.setAttribute("y", `${normalizedCropY}`);
          maskRect.setAttribute("width", `${width}`);
          maskRect.setAttribute("height", `${height}`);

          mask.appendChild(maskRect);
          root.appendChild(mask);
          g.setAttribute("mask", `url(#${mask.id})`);
        }

        g.appendChild(use);
        g.setAttribute(
          "transform",
          `translate(${offsetX - normalizedCropX} ${
            offsetY - normalizedCropY
          }) rotate(${degree} ${adjustedCenterX} ${adjustedCenterY})`,
        );

        if (element.roundness) {
          const clipPath = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "clipPath",
          );
          clipPath.id = `image-clipPath-${element.id}`;
          clipPath.setAttribute("clipPathUnits", "userSpaceOnUse");
          const clipRect = svgRoot.ownerDocument.createElementNS(
            SVG_NS,
            "rect",
          );
          const radius = getCornerRadius(
            Math.min(element.width, element.height),
            element,
          );
          const clipOffsetX = element.crop ? normalizedCropX : 0;
          const clipOffsetY = element.crop ? normalizedCropY : 0;
          clipRect.setAttribute("x", `${clipOffsetX}`);
          clipRect.setAttribute("y", `${clipOffsetY}`);
          clipRect.setAttribute("width", `${element.width}`);
          clipRect.setAttribute("height", `${element.height}`);
          clipRect.setAttribute("rx", `${radius}`);
          clipRect.setAttribute("ry", `${radius}`);
          clipPath.appendChild(clipRect);
          addToRoot(clipPath, element);

          g.setAttributeNS(SVG_NS, "clip-path", `url(#${clipPath.id})`);
        }

        const clipG = maybeWrapNodesInFrameClipPath(
          element,
          root,
          [g],
          renderConfig.frameRendering,
          elementsMap,
        );
        addToRoot(clipG || g, element);
      }
      break;
    }
    // frames are not rendered and only acts as a container
    case "frame":
    case "magicframe": {
      if (
        renderConfig.frameRendering.enabled &&
        renderConfig.frameRendering.outline
      ) {
        const rect = document.createElementNS(SVG_NS, "rect");

        rect.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );

        rect.setAttribute("width", `${element.width}px`);
        rect.setAttribute("height", `${element.height}px`);
        // Rounded corners
        rect.setAttribute("rx", FRAME_STYLE.radius.toString());
        rect.setAttribute("ry", FRAME_STYLE.radius.toString());

        rect.setAttribute("fill", "none");
        rect.setAttribute(
          "stroke",
          renderConfig.theme === THEME.DARK
            ? applyDarkModeFilter(FRAME_STYLE.strokeColor)
            : FRAME_STYLE.strokeColor,
        );
        rect.setAttribute("stroke-width", FRAME_STYLE.strokeWidth.toString());

        addToRoot(rect, element);
      }
      break;
    }
    default: {
      if (isTextElement(element)) {
        const node = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        if (opacity !== 1) {
          node.setAttribute("stroke-opacity", `${opacity}`);
          node.setAttribute("fill-opacity", `${opacity}`);
        }

        node.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );
        const lines = element.text.replace(/\r\n?/g, "\n").split("\n");
        const lineHeightPx = getLineHeightInPx(
          element.fontSize,
          element.lineHeight,
        );
        const horizontalOffset =
          element.textAlign === "center"
            ? element.width / 2
            : element.textAlign === "right"
            ? element.width
            : 0;
        const verticalOffset = getVerticalOffset(
          element.fontFamily,
          element.fontSize,
          lineHeightPx,
        );
        const direction = isRTL(element.text) ? "rtl" : "ltr";
        const textAnchor =
          element.textAlign === "center"
            ? "middle"
            : element.textAlign === "right" || direction === "rtl"
            ? "end"
            : "start";
        for (let i = 0; i < lines.length; i++) {
          const text = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
          text.textContent = lines[i];
          text.setAttribute("x", `${horizontalOffset}`);
          text.setAttribute("y", `${i * lineHeightPx + verticalOffset}`);
          text.setAttribute("font-family", getFontFamilyString(element));
          text.setAttribute("font-size", `${element.fontSize}px`);
          text.setAttribute(
            "fill",
            renderConfig.theme === THEME.DARK
              ? applyDarkModeFilter(element.strokeColor)
              : element.strokeColor,
          );
          text.setAttribute("text-anchor", textAnchor);
          text.setAttribute("style", "white-space: pre;");
          text.setAttribute("direction", direction);
          text.setAttribute("dominant-baseline", "alphabetic");
          node.appendChild(text);
        }

        const g = maybeWrapNodesInFrameClipPath(
          element,
          root,
          [node],
          renderConfig.frameRendering,
          elementsMap,
        );

        addToRoot(g || node, element);
      } else if (element.type === "table") {
        const tableEl = element as any;
        const g = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        g.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );

        const isDark = renderConfig.theme === THEME.DARK;
        const strokeColor = isDark
          ? applyDarkModeFilter(element.strokeColor)
          : element.strokeColor;

        // Header background
        if (tableEl.headerRow && tableEl.rows > 0) {
          const headerRect = svgRoot.ownerDocument.createElementNS(SVG_NS, "rect");
          headerRect.setAttribute("x", "0");
          headerRect.setAttribute("y", "0");
          headerRect.setAttribute("width", `${tableEl.columnWidths.reduce((s: number, w: number) => s + w, 0)}`);
          headerRect.setAttribute("height", `${tableEl.rowHeights[0]}`);
          headerRect.setAttribute("fill", isDark ? "rgba(99,102,140,0.35)" : "rgba(213,216,235,0.35)");
          g.appendChild(headerRect);
        }

        const totalW = tableEl.columnWidths.reduce((s: number, w: number) => s + w, 0);
        const totalH = tableEl.rowHeights.reduce((s: number, h: number) => s + h, 0);

        // Inner grid lines
        let gy = 0;
        for (let r = 1; r < tableEl.rows; r++) {
          gy += tableEl.rowHeights[r - 1];
          const line = svgRoot.ownerDocument.createElementNS(SVG_NS, "line");
          line.setAttribute("x1", "0");
          line.setAttribute("y1", `${gy}`);
          line.setAttribute("x2", `${totalW}`);
          line.setAttribute("y2", `${gy}`);
          line.setAttribute("stroke", isDark ? "#555" : "#c4c4c4");
          line.setAttribute("stroke-width", "1");
          g.appendChild(line);
        }
        let gx = 0;
        for (let c = 1; c < tableEl.columns; c++) {
          gx += tableEl.columnWidths[c - 1];
          const line = svgRoot.ownerDocument.createElementNS(SVG_NS, "line");
          line.setAttribute("x1", `${gx}`);
          line.setAttribute("y1", "0");
          line.setAttribute("x2", `${gx}`);
          line.setAttribute("y2", `${totalH}`);
          line.setAttribute("stroke", isDark ? "#555" : "#c4c4c4");
          line.setAttribute("stroke-width", "1");
          g.appendChild(line);
        }

        // Cell text — font scales with row height (matching canvas renderer)
        gy = 0;
        for (let r = 0; r < tableEl.rows; r++) {
          gx = 0;
          const cellH = tableEl.rowHeights[r];
          const fontSize = Math.max(12, Math.min(72, cellH * 0.44));
          const cellPadding = Math.max(4, fontSize * 0.5);
          for (let c = 0; c < tableEl.columns; c++) {
            const cellText = tableEl.cells[r]?.[c] || "";
            if (cellText) {
              const isHeader = tableEl.headerRow && r === 0;
              const text = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
              text.textContent = cellText;
              text.setAttribute("x", `${gx + cellPadding}`);
              text.setAttribute("y", `${gy + cellH / 2}`);
              text.setAttribute("font-family", "Virgil, Segoe UI Emoji");
              text.setAttribute("font-size", `${fontSize}px`);
              text.setAttribute("fill", strokeColor);
              text.setAttribute("dominant-baseline", "central");
              if (isHeader) {
                text.setAttribute("font-weight", "bold");
              }
              g.appendChild(text);
            }
            gx += tableEl.columnWidths[c];
          }
          gy += tableEl.rowHeights[r];
        }

        // Outer border
        const border = svgRoot.ownerDocument.createElementNS(SVG_NS, "rect");
        border.setAttribute("x", "0");
        border.setAttribute("y", "0");
        border.setAttribute("width", `${totalW}`);
        border.setAttribute("height", `${totalH}`);
        border.setAttribute("fill", "none");
        border.setAttribute("stroke", strokeColor);
        border.setAttribute("stroke-width", `${element.strokeWidth || 2}`);
        g.appendChild(border);

        if (opacity !== 1) {
          g.setAttribute("opacity", `${opacity}`);
        }

        addToRoot(g, element);
      } else if (element.type === "codeblock") {
        const codeEl = element as unknown as ExcalidrawCodeBlockElement;
        const g = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        g.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );

        // Clip to element bounds
        const clipPathId = `codeblock-clip-${element.id}`;
        const clipPath = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "clipPath",
        );
        clipPath.setAttribute("id", clipPathId);
        const clipRect = svgRoot.ownerDocument.createElementNS(SVG_NS, "rect");
        clipRect.setAttribute("x", "0");
        clipRect.setAttribute("y", "0");
        clipRect.setAttribute("width", `${element.width}`);
        clipRect.setAttribute("height", `${element.height}`);
        clipRect.setAttribute("rx", "8");
        clipRect.setAttribute("ry", "8");
        clipPath.appendChild(clipRect);
        g.appendChild(clipPath);

        const clippedGroup = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        clippedGroup.setAttribute("clip-path", `url(#${clipPathId})`);

        // Background
        const bgRect = svgRoot.ownerDocument.createElementNS(SVG_NS, "rect");
        bgRect.setAttribute("x", "0");
        bgRect.setAttribute("y", "0");
        bgRect.setAttribute("width", `${element.width}`);
        bgRect.setAttribute("height", `${element.height}`);
        bgRect.setAttribute("fill", "#1e1e2e");
        bgRect.setAttribute("rx", "8");
        bgRect.setAttribute("ry", "8");
        clippedGroup.appendChild(bgRect);

        // Code text lines
        const code = codeEl.code || "";
        const lines = code.replace(/\r\n?/g, "\n").split("\n");
        const fontSize = 14;
        const lineHeight = 20;
        const scrollOffsetY = codeEl.scrollOffsetY || 0;
        const padding = 12;
        const showLineNumbers = codeEl.showLineNumbers;
        const lineNumWidth = showLineNumbers
          ? `${lines.length}`.length * 9 + 16
          : 0;

        for (let i = 0; i < lines.length; i++) {
          const yPos = padding + i * lineHeight + fontSize - scrollOffsetY;

          if (showLineNumbers) {
            const lineNumText = svgRoot.ownerDocument.createElementNS(
              SVG_NS,
              "text",
            );
            lineNumText.textContent = `${i + 1}`;
            lineNumText.setAttribute("x", `${padding}`);
            lineNumText.setAttribute("y", `${yPos}`);
            lineNumText.setAttribute(
              "font-family",
              "Consolas, Monaco, monospace",
            );
            lineNumText.setAttribute("font-size", `${fontSize}px`);
            lineNumText.setAttribute("fill", "rgba(255,255,255,0.4)");
            lineNumText.setAttribute("text-anchor", "start");
            lineNumText.setAttribute("dominant-baseline", "alphabetic");
            lineNumText.setAttribute("style", "white-space: pre;");
            clippedGroup.appendChild(lineNumText);
          }

          const text = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
          text.textContent = lines[i];
          text.setAttribute("x", `${padding + lineNumWidth}`);
          text.setAttribute("y", `${yPos}`);
          text.setAttribute("font-family", "Consolas, Monaco, monospace");
          text.setAttribute("font-size", `${fontSize}px`);
          text.setAttribute("fill", "#ffffff");
          text.setAttribute("text-anchor", "start");
          text.setAttribute("dominant-baseline", "alphabetic");
          text.setAttribute("style", "white-space: pre;");
          clippedGroup.appendChild(text);
        }

        g.appendChild(clippedGroup);

        if (opacity !== 1) {
          g.setAttribute("opacity", `${opacity}`);
        }

        addToRoot(g, element);
      } else if (element.type === "document") {
        const docEl = element as unknown as ExcalidrawDocumentElement;
        const g = svgRoot.ownerDocument.createElementNS(SVG_NS, "g");
        g.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${
            offsetY || 0
          }) rotate(${degree} ${cx} ${cy})`,
        );

        // Background
        const bgRect = svgRoot.ownerDocument.createElementNS(SVG_NS, "rect");
        bgRect.setAttribute("x", "0");
        bgRect.setAttribute("y", "0");
        bgRect.setAttribute("width", `${element.width}`);
        bgRect.setAttribute("height", `${element.height}`);
        bgRect.setAttribute("fill", "#f5f5f5");
        bgRect.setAttribute("rx", "8");
        bgRect.setAttribute("ry", "8");
        g.appendChild(bgRect);

        // File type badge
        const ext = (docEl.fileType || "").toLowerCase();
        const badgeColorMap: Record<string, string> = {
          js: "#3178c6",
          jsx: "#3178c6",
          ts: "#3178c6",
          tsx: "#3178c6",
          py: "#3776ab",
          cs: "#68217a",
          cpp: "#00599c",
          c: "#00599c",
          h: "#00599c",
          hpp: "#00599c",
          md: "#e67e22",
        };
        const badgeColor = badgeColorMap[ext] || "#6c757d";
        const badgeLabel = ext.toUpperCase() || "FILE";
        const badgeWidth = Math.max(40, badgeLabel.length * 10 + 16);
        const badgeHeight = 24;
        const badgeX = element.width - badgeWidth - 10;
        const badgeY = 10;

        const badgeRect = svgRoot.ownerDocument.createElementNS(SVG_NS, "rect");
        badgeRect.setAttribute("x", `${badgeX}`);
        badgeRect.setAttribute("y", `${badgeY}`);
        badgeRect.setAttribute("width", `${badgeWidth}`);
        badgeRect.setAttribute("height", `${badgeHeight}`);
        badgeRect.setAttribute("fill", badgeColor);
        badgeRect.setAttribute("rx", "4");
        badgeRect.setAttribute("ry", "4");
        g.appendChild(badgeRect);

        // Badge text
        const badgeText = svgRoot.ownerDocument.createElementNS(SVG_NS, "text");
        badgeText.textContent = badgeLabel;
        badgeText.setAttribute("x", `${badgeX + badgeWidth / 2}`);
        badgeText.setAttribute("y", `${badgeY + badgeHeight / 2 + 1}`);
        badgeText.setAttribute("font-family", "Arial, Helvetica, sans-serif");
        badgeText.setAttribute("font-size", "11px");
        badgeText.setAttribute("font-weight", "bold");
        badgeText.setAttribute("fill", "#ffffff");
        badgeText.setAttribute("text-anchor", "middle");
        badgeText.setAttribute("dominant-baseline", "central");
        g.appendChild(badgeText);

        // Filename text
        const fileName = docEl.fileName || "Untitled";
        const fileNameText = svgRoot.ownerDocument.createElementNS(
          SVG_NS,
          "text",
        );
        fileNameText.textContent = fileName;
        fileNameText.setAttribute("x", "16");
        fileNameText.setAttribute("y", `${element.height / 2 + 4}`);
        fileNameText.setAttribute(
          "font-family",
          "Arial, Helvetica, sans-serif",
        );
        fileNameText.setAttribute("font-size", "16px");
        fileNameText.setAttribute("fill", "#333333");
        fileNameText.setAttribute("dominant-baseline", "central");
        g.appendChild(fileNameText);

        if (opacity !== 1) {
          g.setAttribute("opacity", `${opacity}`);
        }

        addToRoot(g, element);
      } else {
        // @ts-ignore
        throw new Error(`Unimplemented type ${element.type}`);
      }
    }
  }
};

export const renderSceneToSvg = (
  elements: readonly NonDeletedExcalidrawElement[],
  elementsMap: RenderableElementsMap,
  rsvg: RoughSVG,
  svgRoot: SVGElement,
  files: BinaryFiles,
  renderConfig: SVGRenderConfig,
) => {
  if (!svgRoot) {
    return;
  }

  // render elements
  elements
    .filter((el) => !isIframeLikeElement(el))
    .forEach((element) => {
      if (!element.isDeleted) {
        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        try {
          renderElementToSvg(
            element,
            elementsMap,
            rsvg,
            svgRoot,
            files,
            element.x + renderConfig.offsetX,
            element.y + renderConfig.offsetY,
            renderConfig,
          );

          const boundTextElement = getBoundTextElement(element, elementsMap);
          if (boundTextElement) {
            renderElementToSvg(
              boundTextElement,
              elementsMap,
              rsvg,
              svgRoot,
              files,
              boundTextElement.x + renderConfig.offsetX,
              boundTextElement.y + renderConfig.offsetY,
              renderConfig,
            );
          }
        } catch (error: any) {
          console.error(error);
        }
      }
    });

  // render embeddables on top
  elements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      if (!element.isDeleted) {
        try {
          renderElementToSvg(
            element,
            elementsMap,
            rsvg,
            svgRoot,
            files,
            element.x + renderConfig.offsetX,
            element.y + renderConfig.offsetY,
            renderConfig,
          );
        } catch (error: any) {
          console.error(error);
        }
      }
    });
};
