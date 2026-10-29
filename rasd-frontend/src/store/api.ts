import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  AuthConfigResponse,
  AuthMeResponse,
  AuthSessionResponse,
  ChatMessage, ChatReply, ReportResponse, ScoreHistory, SignupResponse, SiteScanDetail,
  SiteScanListItem, StartScanResponse,
} from '@/types';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    credentials: 'include',
  }),
  tagTypes: ['SiteScanList', 'SiteScan', 'Report', 'ChatHistory', 'Auth'],
  endpoints: (build) => ({
    startScan: build.mutation<StartScanResponse, { url: string }>({
      query: (body) => ({ url: '/scan', method: 'POST', body }),
      invalidatesTags: ['SiteScanList', 'Auth'],
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
    generateReport: build.mutation<
      { jobId?: string; siteScanId: string },
      { id: string; lang: string }
    >({
      query: ({ id, lang }) => ({
        url: `/site-scan/${id}/report?lang=${lang}`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Report', id }],
    }),
    getReport: build.query<ReportResponse, { id: string; lang: string }>({
      query: ({ id, lang }) => `/site-scan/${id}/report?lang=${lang}`,
      providesTags: (_r, _e, { id }) => [{ type: 'Report', id }],
    }),
    sendChatMessage: build.mutation<
  ChatReply,
  { siteScanId: string; message: string; conversationId?: string; lang: string }
>({
  query: ({ siteScanId, ...body }) => ({
    url: `/site-scan/${siteScanId}/chat`,
    method: 'POST',
    body,
  }),
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
    getMe: build.query<AuthMeResponse, void>({
      query: () => '/auth/me',
      providesTags: ['Auth'],
    }),
    getAuthConfig: build.query<AuthConfigResponse, void>({
      query: () => '/auth/config',
    }),
    signup: build.mutation<
      SignupResponse,
      { name: string; email: string; password: string }
    >({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
    }),
    verifyOtp: build.mutation<
      AuthSessionResponse,
      { email: string; code: string }
    >({
      query: (body) => ({ url: '/auth/verify-otp', method: 'POST', body }),
      invalidatesTags: ['Auth', 'SiteScanList'],
    }),
    resendOtp: build.mutation<
      { sent: boolean; resendCooldownSeconds: number },
      { email: string }
    >({
      query: (body) => ({ url: '/auth/resend-otp', method: 'POST', body }),
    }),
    login: build.mutation<
      AuthSessionResponse,
      { email: string; password: string }
    >({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['Auth', 'SiteScanList'],
    }),
    googleSignIn: build.mutation<AuthSessionResponse, { idToken: string }>({
      query: (body) => ({ url: '/auth/google', method: 'POST', body }),
      invalidatesTags: ['Auth', 'SiteScanList'],
    }),
    logout: build.mutation<{ ok: boolean }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Auth', 'SiteScanList'],
    }),
    migrateGuest: build.mutation<{ migrated: number }, void>({
      query: () => ({ url: '/auth/migrate-guest', method: 'POST' }),
      invalidatesTags: ['Auth', 'SiteScanList'],
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
  useGetMeQuery,
  useGetAuthConfigQuery,
  useSignupMutation,
  useVerifyOtpMutation,
  useResendOtpMutation,
  useLoginMutation,
  useGoogleSignInMutation,
  useLogoutMutation,
  useMigrateGuestMutation,
} = api;
