import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  ChatMessage, ChatReply, ReportResponse, ScoreHistory, SiteScanDetail,
  SiteScanListItem, StartScanResponse,
} from '@/types';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: process.env.NEXT_PUBLIC_API_URL }),
  tagTypes: ['SiteScanList', 'SiteScan', 'Report', 'ChatHistory'],
  endpoints: (build) => ({
    startScan: build.mutation<StartScanResponse, { url: string }>({
      query: (body) => ({ url: '/scan', method: 'POST', body }),
      invalidatesTags: ['SiteScanList'],
    }),
    listSiteScans: build.query<SiteScanListItem[], void>({
      query: () => '/site-scan',
      providesTags: ['SiteScanList'],
    }),
    getSiteScan: build.query<SiteScanDetail, string>({
      query: (id) => `/site-scan/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'SiteScan', id }],
    }),
    getScoreHistory: build.query<ScoreHistory, string>({
      query: (id) => `/site-scan/${id}/history`,
      providesTags: (_r, _e, id) => [{ type: 'SiteScan', id }],
    }),
    generateReport: build.mutation<{ jobId?: string; siteScanId: string }, string>({
      query: (id) => ({ url: `/site-scan/${id}/report`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Report', id }],
    }),
    getReport: build.query<ReportResponse, string>({
      query: (id) => `/site-scan/${id}/report`,
      providesTags: (_r, _e, id) => [{ type: 'Report', id }],
    }),
    sendChatMessage: build.mutation<
  ChatReply,
  { siteScanId: string; message: string; conversationId?: string }
>({
  query: ({ siteScanId, ...body }) => ({
    url: `/site-scan/${siteScanId}/chat`,
    method: 'POST',
    body,
  }),
  // الـ agent ممكن يعمل re-scan، فنحدّث بيانات الـ scan
  invalidatesTags: (_r, _e, arg) => [{ type: 'SiteScan', id: arg.siteScanId }],
}),
getChatHistory: build.query<
  ChatMessage[],
  { siteScanId: string; conversationId: string }
>({
  query: ({ siteScanId, conversationId }) =>
    `/site-scan/${siteScanId}/chat/${conversationId}/history`,
  providesTags: (_r, _e, a) => [{ type: 'ChatHistory', id: a.conversationId }],
}),
  }),
});

export const {
  useStartScanMutation,
  useListSiteScansQuery,
  useGetSiteScanQuery,
  useGetScoreHistoryQuery,
  useGenerateReportMutation,
  useGetReportQuery,
  useSendChatMessageMutation,
  useGetChatHistoryQuery,
} = api;