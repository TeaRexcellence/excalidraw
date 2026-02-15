import React, { Suspense } from "react";

const CodeBlockEditorModalInner = React.lazy(
  () => import("./CodeBlockEditorModalInner"),
);

interface CodeBlockEditorModalProps {
  elementId: string;
  onClose: () => void;
}

export const CodeBlockEditorModal: React.FC<CodeBlockEditorModalProps> = ({
  elementId,
  onClose,
}) => {
  return (
    <Suspense
      fallback={
        <div className="CodeBlockEditorModal-loading">
          <div className="CodeBlockEditorModal-loading__spinner" />
        </div>
      }
    >
      <CodeBlockEditorModalInner elementId={elementId} onClose={onClose} />
    </Suspense>
  );
};
