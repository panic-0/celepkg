import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildPageItems } from "../utils/pagination";

type PaginationProps = {
  end: number;
  page: number;
  pageCount: number;
  start: number;
  total: number;
  ariaLabel: string;
  onPageChange: (page: number) => void;
};

export function Pagination({ end, page, pageCount, start, total, ariaLabel, onPageChange }: PaginationProps) {
  const pageItems = buildPageItems(page, pageCount, 3);
  return (
    <div className="pagination-bar" aria-label={ariaLabel}>
      <button className="icon-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} title="上一页">
        <ChevronLeft size={16} />
      </button>
      <div className="pagination-numbers">
        {pageItems.map((item, index) =>
          item === "ellipsis" ? (
            <span className="pagination-ellipsis" key={`ellipsis-${index}`} aria-hidden="true">
              ...
            </span>
          ) : (
            <button
              className={`pagination-page ${item === page ? "active" : ""}`}
              disabled={item === page}
              key={item}
              onClick={() => onPageChange(item)}
              title={`第 ${item} 页`}
            >
              {item}
            </button>
          )
        )}
      </div>
      <small>{`${start}-${end} / ${total}`}</small>
      <button className="icon-button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} title="下一页">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
