import React, { useCallback, useEffect, useState } from 'react';
import { CornerDownRight, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  deleteComentario,
  fetchComentarios,
  fetchRespuestasComentario,
  formatRelativeDate,
  postComentario,
} from '../lib/pictaClient';
import type { PictaComentario } from '../types/picta';
import { MediaImage } from './MediaImage';

interface CommentsSectionProps {
  publicacionId: number;
  commentsEnabled?: boolean;
}

export const CommentsSection: React.FC<CommentsSectionProps> = React.memo(({
  publicacionId,
  commentsEnabled = true,
}) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<PictaComentario[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [repliesMap, setRepliesMap] = useState<Record<number, PictaComentario[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<number, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');

  const loadComments = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!commentsEnabled) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchComentarios(publicacionId, pageNum);
        const topLevel = (res.results || []).filter(
          (c) => !c.comentario || (typeof c.comentario === 'object' && !c.comentario.id),
        );
        setComments((prev) => (append ? [...prev, ...topLevel] : topLevel));
        setTotalCount(res.count || topLevel.length);
        setHasMore(Boolean(res.next));
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los comentarios.');
      } finally {
        setLoading(false);
      }
    },
    [publicacionId, commentsEnabled],
  );

  useEffect(() => {
    setRepliesMap({});
    setReplyingTo(null);
    loadComments(1, false);
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await postComentario(publicacionId, text.trim());
      setComments((prev) => [created, ...prev]);
      setTotalCount((c) => c + 1);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleReplies = async (commentId: number) => {
    if (repliesMap[commentId]) {
      setRepliesMap((prev) => {
        const copy = { ...prev };
        delete copy[commentId];
        return copy;
      });
      return;
    }
    setLoadingReplies((prev) => ({ ...prev, [commentId]: true }));
    try {
      const replies = await fetchRespuestasComentario(commentId);
      setRepliesMap((prev) => ({ ...prev, [commentId]: replies }));
    } catch {
      // ignore reply load failure
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const handleSendReply = async (parentId: number) => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await postComentario(publicacionId, replyText.trim(), parentId);
      setRepliesMap((prev) => ({
        ...prev,
        [parentId]: [...(prev[parentId] || []), created],
      }));
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId ? { ...c, cantidad_respuestas: (c.cantidad_respuestas || 0) + 1 } : c,
        ),
      );
      setReplyText('');
      setReplyingTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la respuesta.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number, parentId?: number) => {
    try {
      await deleteComentario(commentId);
      if (parentId) {
        setRepliesMap((prev) => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter((r) => r.id !== commentId),
        }));
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setTotalCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el comentario.');
    }
  };

  if (!commentsEnabled) {
    return (
      <div className="py-8 text-center text-sm text-[#9CA3AF]">
        Los comentarios están desactivados para esta publicación.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-[#F5F6F8]">
          Comentarios <span className="font-mono-tabular text-sm text-[#9CA3AF] ml-1">{totalCount}</span>
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-full overflow-hidden bg-[#181B22] shrink-0 border border-white/10">
          <MediaImage
            src={user?.avatar}
            size="80x80"
            alt={user?.username || 'Usuario'}
            variant="avatar"
            fallbackText={user?.username || 'U'}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un comentario..."
            className="flex-1 min-h-[44px] rounded-xl bg-[#111318] border border-white/10 focus:border-[#FF4D4D] focus:outline-none px-3.5 text-sm text-[#F5F6F8] placeholder:text-[#6B7280]"
          />
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Publicar comentario"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>

      {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}

      {loading && comments.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-[#181B22]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-28 rounded bg-[#181B22]" />
                <div className="h-4 w-3/4 rounded bg-[#181B22]" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="py-8 flex flex-col items-center text-center text-[#9CA3AF]">
          <MessageSquare className="w-7 h-7 opacity-40 mb-2" />
          <p className="text-sm">Sé el primero en comentar este video.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {comments.map((comment) => {
            const isOwn = user?.username && comment.usuario?.username === user.username;
            const replies = repliesMap[comment.id];
            const replyCount = comment.cantidad_respuestas || 0;

            return (
              <div key={comment.id} className="py-3.5 first:pt-1">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[#181B22] shrink-0 border border-white/[0.06]">
                    <MediaImage
                      src={comment.usuario?.avatar}
                      size="80x80"
                      alt={comment.usuario?.username || 'Usuario'}
                      variant="avatar"
                      fallbackText={comment.usuario?.username || 'U'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                      <span className="font-semibold text-[#F5F6F8] truncate">
                        {comment.usuario?.username || 'Usuario'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeDate(comment.fecha)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#F5F6F8]/95 leading-relaxed whitespace-pre-wrap break-words">
                      {comment.texto}
                    </p>

                    <div className="mt-2 flex items-center gap-4 text-xs text-[#9CA3AF]">
                      <button
                        type="button"
                        onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                        className="min-h-[36px] inline-flex items-center gap-1.5 hover:text-[#F5F6F8] cursor-pointer"
                      >
                        <CornerDownRight className="w-3.5 h-3.5" />
                        <span>Responder</span>
                      </button>

                      {replyCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleToggleReplies(comment.id)}
                          className="min-h-[36px] text-[#FF4D4D] hover:text-[#FF6666] font-medium cursor-pointer"
                        >
                          {loadingReplies[comment.id]
                            ? 'Cargando...'
                            : replies
                              ? 'Ocultar respuestas'
                              : `Ver ${replyCount} ${replyCount === 1 ? 'respuesta' : 'respuestas'}`}
                        </button>
                      )}

                      {isOwn && (
                        <button
                          type="button"
                          onClick={() => handleDelete(comment.id)}
                          className="min-h-[36px] inline-flex items-center gap-1 hover:text-[#FF4D4D] cursor-pointer ml-auto"
                          aria-label="Eliminar comentario"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {replyingTo === comment.id && (
                      <div className="mt-2.5 flex gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Escribe una respuesta..."
                          className="flex-1 min-h-[42px] rounded-xl bg-[#111318] border border-white/10 focus:border-[#FF4D4D] focus:outline-none px-3 text-sm text-[#F5F6F8]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendReply(comment.id)}
                          disabled={!replyText.trim() || submitting}
                          className="min-h-[42px] px-3.5 rounded-xl bg-[#FF4D4D] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                        >
                          Enviar
                        </button>
                      </div>
                    )}

                    {replies && replies.length > 0 && (
                      <div className="mt-3 pl-4 border-l border-white/10 space-y-3">
                        {replies.map((rep) => {
                          const isOwnReply = user?.username && rep.usuario?.username === user.username;
                          return (
                            <div key={rep.id} className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-full overflow-hidden bg-[#181B22] shrink-0">
                                <MediaImage
                                  src={rep.usuario?.avatar}
                                  size="80x80"
                                  alt={rep.usuario?.username || 'Usuario'}
                                  variant="avatar"
                                  fallbackText={rep.usuario?.username || 'U'}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                                  <span className="font-semibold text-[#F5F6F8]">
                                    {rep.usuario?.username || 'Usuario'}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatRelativeDate(rep.fecha)}</span>
                                  {isOwnReply && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(rep.id, comment.id)}
                                      className="ml-auto hover:text-[#FF4D4D] cursor-pointer"
                                      aria-label="Eliminar respuesta"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <p className="mt-0.5 text-sm text-[#F5F6F8]/90 break-words">
                                  {rep.texto}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => loadComments(page + 1, true)}
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/10 text-sm font-medium text-[#F5F6F8] cursor-pointer"
              >
                {loading ? 'Cargando...' : 'Cargar más comentarios'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
