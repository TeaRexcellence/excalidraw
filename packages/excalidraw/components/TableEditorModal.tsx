import React, { Suspense } from "react";

const TableEditorModalInner = React.lazy(
  () => import("./TableEditorModalInner"),
);

interface TableEditorModalProps {
  elementId: string;
  onClose: () => void;
}

export const TableEditorModal: React.FC<TableEditorModalProps> = ({
  elementId,
  onClose,
}) => {
  return (
    <Suspense
      fallback={
        <div className="TableEditorModal-loading">
          <div className="TableEditorModal-loading__spinner" />
        </div>
      }
    >
      <TableEditorModalInner elementId={elementId} onClose={onClose} />
    </Suspense>
  );
};
