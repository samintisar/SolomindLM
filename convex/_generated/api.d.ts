/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as ResendOTPPasswordReset from "../ResendOTPPasswordReset.js";
import type * as _agents_AudioOverviewGraph from "../_agents/AudioOverviewGraph.js";
import type * as _agents_ChatAgent from "../_agents/ChatAgent.js";
import type * as _agents_FlashcardGraph from "../_agents/FlashcardGraph.js";
import type * as _agents_MindMapGraph from "../_agents/MindMapGraph.js";
import type * as _agents_QuizGraph from "../_agents/QuizGraph.js";
import type * as _agents_ReportGraph from "../_agents/ReportGraph.js";
import type * as _agents_SlideDeckGraph from "../_agents/SlideDeckGraph.js";
import type * as _agents_SpreadsheetGraph from "../_agents/SpreadsheetGraph.js";
import type * as _agents_WrittenQuestionsGraph from "../_agents/WrittenQuestionsGraph.js";
import type * as _agents__shared_agent_graph_limits from "../_agents/_shared/agent_graph_limits.js";
import type * as _agents__shared_cachedLlm from "../_agents/_shared/cachedLlm.js";
import type * as _agents__shared_chunk_helper_factory from "../_agents/_shared/chunk_helper_factory.js";
import type * as _agents__shared_chunk_operations from "../_agents/_shared/chunk_operations.js";
import type * as _agents__shared_citationExtract from "../_agents/_shared/citationExtract.js";
import type * as _agents__shared_concurrency from "../_agents/_shared/concurrency.js";
import type * as _agents__shared_graph_builder from "../_agents/_shared/graph_builder.js";
import type * as _agents__shared_index from "../_agents/_shared/index.js";
import type * as _agents__shared_jobHelpers from "../_agents/_shared/jobHelpers.js";
import type * as _agents__shared_langsmith from "../_agents/_shared/langsmith.js";
import type * as _agents__shared_llm_factory from "../_agents/_shared/llm_factory.js";
import type * as _agents__shared_logging from "../_agents/_shared/logging.js";
import type * as _agents__shared_markdownMathPrompt from "../_agents/_shared/markdownMathPrompt.js";
import type * as _agents__shared_node_builder from "../_agents/_shared/node_builder.js";
import type * as _agents__shared_progress from "../_agents/_shared/progress.js";
import type * as _agents__shared_retry from "../_agents/_shared/retry.js";
import type * as _agents__shared_sanitization from "../_agents/_shared/sanitization.js";
import type * as _agents__shared_state_cleanup from "../_agents/_shared/state_cleanup.js";
import type * as _agents__shared_state_factory from "../_agents/_shared/state_factory.js";
import type * as _agents__shared_timeout from "../_agents/_shared/timeout.js";
import type * as _agents__shared_tokenizer from "../_agents/_shared/tokenizer.js";
import type * as _agents__shared_topic_extraction from "../_agents/_shared/topic_extraction.js";
import type * as _agents__shared_validation from "../_agents/_shared/validation.js";
import type * as _agents_audio_overview_AudioOverviewGraph from "../_agents/audio_overview/AudioOverviewGraph.js";
import type * as _agents_audio_overview_chunkHelpers from "../_agents/audio_overview/chunkHelpers.js";
import type * as _agents_audio_overview_config from "../_agents/audio_overview/config.js";
import type * as _agents_audio_overview_nodeCollapse from "../_agents/audio_overview/nodeCollapse.js";
import type * as _agents_audio_overview_nodeExtractBeats from "../_agents/audio_overview/nodeExtractBeats.js";
import type * as _agents_audio_overview_nodeSynthesizeAudio from "../_agents/audio_overview/nodeSynthesizeAudio.js";
import type * as _agents_audio_overview_nodeWriteScript from "../_agents/audio_overview/nodeWriteScript.js";
import type * as _agents_audio_overview_prompts from "../_agents/audio_overview/prompts.js";
import type * as _agents_audio_overview_state from "../_agents/audio_overview/state.js";
import type * as _agents_audio_overview_voices from "../_agents/audio_overview/voices.js";
import type * as _agents_chat_chatHistoryBudget from "../_agents/chat/chatHistoryBudget.js";
import type * as _agents_chat_chatRouter from "../_agents/chat/chatRouter.js";
import type * as _agents_chat_chat_llm_grounding from "../_agents/chat/chat_llm_grounding.js";
import type * as _agents_chat_chat_llm_prompts from "../_agents/chat/chat_llm_prompts.js";
import type * as _agents_chat_chat_llm_types from "../_agents/chat/chat_llm_types.js";
import type * as _agents_chat_chat_retrieval_subqueries from "../_agents/chat/chat_retrieval_subqueries.js";
import type * as _agents_chat_grounding_validator from "../_agents/chat/grounding_validator.js";
import type * as _agents_chat_hybrid_search from "../_agents/chat/hybrid_search.js";
import type * as _agents_chat_llm_wrapper from "../_agents/chat/llm_wrapper.js";
import type * as _agents_chat_rerankCache from "../_agents/chat/rerankCache.js";
import type * as _agents_chat_sourceSuggestions from "../_agents/chat/sourceSuggestions.js";
import type * as _agents_chat_vector_search from "../_agents/chat/vector_search.js";
import type * as _agents_flashcard_FlashcardGraph from "../_agents/flashcard/FlashcardGraph.js";
import type * as _agents_flashcard_chunkHelpers from "../_agents/flashcard/chunkHelpers.js";
import type * as _agents_flashcard_collapseReduceLlm from "../_agents/flashcard/collapseReduceLlm.js";
import type * as _agents_flashcard_config from "../_agents/flashcard/config.js";
import type * as _agents_flashcard_flashcardHeuristics from "../_agents/flashcard/flashcardHeuristics.js";
import type * as _agents_flashcard_formatFlashcards from "../_agents/flashcard/formatFlashcards.js";
import type * as _agents_flashcard_nodeCollapse from "../_agents/flashcard/nodeCollapse.js";
import type * as _agents_flashcard_nodeMap from "../_agents/flashcard/nodeMap.js";
import type * as _agents_flashcard_nodeReduce from "../_agents/flashcard/nodeReduce.js";
import type * as _agents_flashcard_nodeSplit from "../_agents/flashcard/nodeSplit.js";
import type * as _agents_flashcard_prompts from "../_agents/flashcard/prompts.js";
import type * as _agents_flashcard_routing from "../_agents/flashcard/routing.js";
import type * as _agents_flashcard_state from "../_agents/flashcard/state.js";
import type * as _agents_flashcard_structuredLlm from "../_agents/flashcard/structuredLlm.js";
import type * as _agents_flashcard_textCleanup from "../_agents/flashcard/textCleanup.js";
import type * as _agents_mindmap_MindMapGraph from "../_agents/mindmap/MindMapGraph.js";
import type * as _agents_mindmap_chunkHelpers from "../_agents/mindmap/chunkHelpers.js";
import type * as _agents_mindmap_config from "../_agents/mindmap/config.js";
import type * as _agents_mindmap_fallbacks from "../_agents/mindmap/fallbacks.js";
import type * as _agents_mindmap_nodeMap from "../_agents/mindmap/nodeMap.js";
import type * as _agents_mindmap_nodeReduce from "../_agents/mindmap/nodeReduce.js";
import type * as _agents_mindmap_parsing from "../_agents/mindmap/parsing.js";
import type * as _agents_mindmap_prompts from "../_agents/mindmap/prompts.js";
import type * as _agents_mindmap_routing from "../_agents/mindmap/routing.js";
import type * as _agents_mindmap_state from "../_agents/mindmap/state.js";
import type * as _agents_mindmap_structuredLlm from "../_agents/mindmap/structuredLlm.js";
import type * as _agents_quiz_QuizGraph from "../_agents/quiz/QuizGraph.js";
import type * as _agents_quiz_chunkHelpers from "../_agents/quiz/chunkHelpers.js";
import type * as _agents_quiz_config from "../_agents/quiz/config.js";
import type * as _agents_quiz_nodeCollapse from "../_agents/quiz/nodeCollapse.js";
import type * as _agents_quiz_nodeMap from "../_agents/quiz/nodeMap.js";
import type * as _agents_quiz_nodeReduce from "../_agents/quiz/nodeReduce.js";
import type * as _agents_quiz_nodeSplit from "../_agents/quiz/nodeSplit.js";
import type * as _agents_quiz_postprocess from "../_agents/quiz/postprocess.js";
import type * as _agents_quiz_prompts from "../_agents/quiz/prompts.js";
import type * as _agents_quiz_quizHeuristics from "../_agents/quiz/quizHeuristics.js";
import type * as _agents_quiz_routing from "../_agents/quiz/routing.js";
import type * as _agents_quiz_state from "../_agents/quiz/state.js";
import type * as _agents_quiz_structuredLlm from "../_agents/quiz/structuredLlm.js";
import type * as _agents_report_ReportGraph from "../_agents/report/ReportGraph.js";
import type * as _agents_report_chunkHelpers from "../_agents/report/chunkHelpers.js";
import type * as _agents_report_config from "../_agents/report/config.js";
import type * as _agents_report_inputValidation from "../_agents/report/inputValidation.js";
import type * as _agents_report_invokeHelpers from "../_agents/report/invokeHelpers.js";
import type * as _agents_report_nodeCollapse from "../_agents/report/nodeCollapse.js";
import type * as _agents_report_nodeMap from "../_agents/report/nodeMap.js";
import type * as _agents_report_nodeMerge from "../_agents/report/nodeMerge.js";
import type * as _agents_report_nodeReduce from "../_agents/report/nodeReduce.js";
import type * as _agents_report_nodes from "../_agents/report/nodes.js";
import type * as _agents_report_prompts from "../_agents/report/prompts.js";
import type * as _agents_report_routing from "../_agents/report/routing.js";
import type * as _agents_report_state from "../_agents/report/state.js";
import type * as _agents_report_structuredLlm from "../_agents/report/structuredLlm.js";
import type * as _agents_report_topicAnalysis from "../_agents/report/topicAnalysis.js";
import type * as _agents_slides_SlideDeckGraph from "../_agents/slides/SlideDeckGraph.js";
import type * as _agents_slides_chunkHelpers from "../_agents/slides/chunkHelpers.js";
import type * as _agents_slides_config from "../_agents/slides/config.js";
import type * as _agents_slides_nodeCollapse from "../_agents/slides/nodeCollapse.js";
import type * as _agents_slides_nodeGenerateImages from "../_agents/slides/nodeGenerateImages.js";
import type * as _agents_slides_nodeMap from "../_agents/slides/nodeMap.js";
import type * as _agents_slides_nodeReduce from "../_agents/slides/nodeReduce.js";
import type * as _agents_slides_nodeSplit from "../_agents/slides/nodeSplit.js";
import type * as _agents_slides_prompts from "../_agents/slides/prompts.js";
import type * as _agents_slides_routing from "../_agents/slides/routing.js";
import type * as _agents_slides_services_SlideImageGenerationService from "../_agents/slides/services/SlideImageGenerationService.js";
import type * as _agents_slides_slideHeuristics from "../_agents/slides/slideHeuristics.js";
import type * as _agents_slides_state from "../_agents/slides/state.js";
import type * as _agents_slides_structuredLlm from "../_agents/slides/structuredLlm.js";
import type * as _agents_spreadsheet_SpreadsheetGraph from "../_agents/spreadsheet/SpreadsheetGraph.js";
import type * as _agents_spreadsheet_chunkHelpers from "../_agents/spreadsheet/chunkHelpers.js";
import type * as _agents_spreadsheet_config from "../_agents/spreadsheet/config.js";
import type * as _agents_spreadsheet_csvHelpers from "../_agents/spreadsheet/csvHelpers.js";
import type * as _agents_spreadsheet_inputValidation from "../_agents/spreadsheet/inputValidation.js";
import type * as _agents_spreadsheet_nodeCollapse from "../_agents/spreadsheet/nodeCollapse.js";
import type * as _agents_spreadsheet_nodeMap from "../_agents/spreadsheet/nodeMap.js";
import type * as _agents_spreadsheet_nodeMerge from "../_agents/spreadsheet/nodeMerge.js";
import type * as _agents_spreadsheet_nodeReduce from "../_agents/spreadsheet/nodeReduce.js";
import type * as _agents_spreadsheet_prompts from "../_agents/spreadsheet/prompts.js";
import type * as _agents_spreadsheet_routing from "../_agents/spreadsheet/routing.js";
import type * as _agents_spreadsheet_state from "../_agents/spreadsheet/state.js";
import type * as _agents_wiki_WikiGraph from "../_agents/wiki/WikiGraph.js";
import type * as _agents_wiki_config from "../_agents/wiki/config.js";
import type * as _agents_wiki_nodes from "../_agents/wiki/nodes.js";
import type * as _agents_wiki_prompts from "../_agents/wiki/prompts.js";
import type * as _agents_wiki_state from "../_agents/wiki/state.js";
import type * as _agents_written_questions_WrittenQuestionsGraph from "../_agents/written_questions/WrittenQuestionsGraph.js";
import type * as _agents_written_questions_chunkHelpers from "../_agents/written_questions/chunkHelpers.js";
import type * as _agents_written_questions_config from "../_agents/written_questions/config.js";
import type * as _agents_written_questions_nodeCollapse from "../_agents/written_questions/nodeCollapse.js";
import type * as _agents_written_questions_nodeMap from "../_agents/written_questions/nodeMap.js";
import type * as _agents_written_questions_nodeReduce from "../_agents/written_questions/nodeReduce.js";
import type * as _agents_written_questions_nodeSplit from "../_agents/written_questions/nodeSplit.js";
import type * as _agents_written_questions_postprocess from "../_agents/written_questions/postprocess.js";
import type * as _agents_written_questions_prompts from "../_agents/written_questions/prompts.js";
import type * as _agents_written_questions_questionHeuristics from "../_agents/written_questions/questionHeuristics.js";
import type * as _agents_written_questions_routing from "../_agents/written_questions/routing.js";
import type * as _agents_written_questions_state from "../_agents/written_questions/state.js";
import type * as _agents_written_questions_structuredLlm from "../_agents/written_questions/structuredLlm.js";
import type * as _lib_env from "../_lib/env.js";
import type * as _lib_errors from "../_lib/errors.js";
import type * as _lib_googleDriveDownload from "../_lib/googleDriveDownload.js";
import type * as _lib_limits from "../_lib/limits.js";
import type * as _lib_logging_serviceLogger from "../_lib/logging/serviceLogger.js";
import type * as _lib_notebookAccess from "../_lib/notebookAccess.js";
import type * as _lib_rateLimits from "../_lib/rateLimits.js";
import type * as _lib_resendSendError from "../_lib/resendSendError.js";
import type * as _lib_serviceErrors from "../_lib/serviceErrors.js";
import type * as _lib_shareToken from "../_lib/shareToken.js";
import type * as _lib_srsScheduling from "../_lib/srsScheduling.js";
import type * as _lib_utils_urlValidation from "../_lib/utils/urlValidation.js";
import type * as _model_audioOverviews from "../_model/audioOverviews.js";
import type * as _model_conversations from "../_model/conversations.js";
import type * as _model_documents from "../_model/documents.js";
import type * as _model_flashcards from "../_model/flashcards.js";
import type * as _model_folders from "../_model/folders.js";
import type * as _model_mindmaps from "../_model/mindmaps.js";
import type * as _model_notebooks from "../_model/notebooks.js";
import type * as _model_notes from "../_model/notes.js";
import type * as _model_quizzes from "../_model/quizzes.js";
import type * as _model_reports from "../_model/reports.js";
import type * as _model_slides from "../_model/slides.js";
import type * as _model_spreadsheets from "../_model/spreadsheets.js";
import type * as _model_wiki from "../_model/wiki.js";
import type * as _model_writtenQuestions from "../_model/writtenQuestions.js";
import type * as _services_ai_embeddings from "../_services/ai/embeddings.js";
import type * as _services_ai_titleGenerator from "../_services/ai/titleGenerator.js";
import type * as _services_ai_togetherTts from "../_services/ai/togetherTts.js";
import type * as _services_cache_cache from "../_services/cache/cache.js";
import type * as _services_cache_cacheCrypto from "../_services/cache/cacheCrypto.js";
import type * as _services_cache_cacheMetrics from "../_services/cache/cacheMetrics.js";
import type * as _services_cache_cachedAgent from "../_services/cache/cachedAgent.js";
import type * as _services_extraction_AudioTranscriptionService from "../_services/extraction/AudioTranscriptionService.js";
import type * as _services_extraction_MistralOCRService from "../_services/extraction/MistralOCRService.js";
import type * as _services_extraction_SupadataLoaderService from "../_services/extraction/SupadataLoaderService.js";
import type * as _services_extractors from "../_services/extractors.js";
import type * as _services_grading_WrittenQuestionsGradingService from "../_services/grading/WrittenQuestionsGradingService.js";
import type * as _services_processing_DocumentMetadataExtractor from "../_services/processing/DocumentMetadataExtractor.js";
import type * as _services_processing_EmbeddingServiceClient from "../_services/processing/EmbeddingServiceClient.js";
import type * as _services_processing_StructuralChunker from "../_services/processing/StructuralChunker.js";
import type * as _services_processing_TextSplitterService from "../_services/processing/TextSplitterService.js";
import type * as _services_search_DiscoveryService from "../_services/search/DiscoveryService.js";
import type * as _services_search_OpenAlexSearchService from "../_services/search/OpenAlexSearchService.js";
import type * as _services_search_TavilySearchService from "../_services/search/TavilySearchService.js";
import type * as _shared_mathMarkdown from "../_shared/mathMarkdown.js";
import type * as auth from "../auth.js";
import type * as billing_actions from "../billing/actions.js";
import type * as billing_index from "../billing/index.js";
import type * as billing_webhook from "../billing/webhook.js";
import type * as chat_conversations from "../chat/conversations.js";
import type * as chat_index from "../chat/index.js";
import type * as chat_messages from "../chat/messages.js";
import type * as chat_sourceSuggestions from "../chat/sourceSuggestions.js";
import type * as chat_stream from "../chat/stream.js";
import type * as documents_embeddingJob from "../documents/embeddingJob.js";
import type * as documents_embeddings from "../documents/embeddings.js";
import type * as documents_index from "../documents/index.js";
import type * as documents_refreshRemote from "../documents/refreshRemote.js";
import type * as folders_index from "../folders/index.js";
import type * as googleDrive from "../googleDrive.js";
import type * as http from "../http.js";
import type * as notebooks__forkNotebook from "../notebooks/_forkNotebook.js";
import type * as notebooks_index from "../notebooks/index.js";
import type * as notebooks_sharing from "../notebooks/sharing.js";
import type * as notes_index from "../notes/index.js";
import type * as notes_userNotes from "../notes/userNotes.js";
import type * as push_index from "../push/index.js";
import type * as scripts_fixAudioUrls from "../scripts/fixAudioUrls.js";
import type * as scripts_runFixAudioUrls from "../scripts/runFixAudioUrls.js";
import type * as server from "../server.js";
import type * as storage_ChatHistoryService from "../storage/ChatHistoryService.js";
import type * as storage_ConvexStorageService from "../storage/ConvexStorageService.js";
import type * as storage_VectorStoreService from "../storage/VectorStoreService.js";
import type * as studio__job_collapseStringOutputsByTokens from "../studio/_job/collapseStringOutputsByTokens.js";
import type * as studio__job_invokeStudioLlm from "../studio/_job/invokeStudioLlm.js";
import type * as studio_audio_audioJobPhases from "../studio/audio/audioJobPhases.js";
import type * as studio_audio_fixAudioUrl from "../studio/audio/fixAudioUrl.js";
import type * as studio_audio_index from "../studio/audio/index.js";
import type * as studio_audio_job from "../studio/audio/job.js";
import type * as studio_flashcards_flashcardJobPhases from "../studio/flashcards/flashcardJobPhases.js";
import type * as studio_flashcards_index from "../studio/flashcards/index.js";
import type * as studio_flashcards_job from "../studio/flashcards/job.js";
import type * as studio_jobMutations_audio from "../studio/jobMutations/audio.js";
import type * as studio_jobMutations_documents from "../studio/jobMutations/documents.js";
import type * as studio_jobMutations_flashcards from "../studio/jobMutations/flashcards.js";
import type * as studio_jobMutations_jobErrorUtils from "../studio/jobMutations/jobErrorUtils.js";
import type * as studio_jobMutations_mindmaps from "../studio/jobMutations/mindmaps.js";
import type * as studio_jobMutations_quizzes from "../studio/jobMutations/quizzes.js";
import type * as studio_jobMutations_reports from "../studio/jobMutations/reports.js";
import type * as studio_jobMutations_slides from "../studio/jobMutations/slides.js";
import type * as studio_jobMutations_spreadsheets from "../studio/jobMutations/spreadsheets.js";
import type * as studio_jobMutations_writtenQuestions from "../studio/jobMutations/writtenQuestions.js";
import type * as studio_mindmaps_index from "../studio/mindmaps/index.js";
import type * as studio_mindmaps_job from "../studio/mindmaps/job.js";
import type * as studio_mindmaps_mindmapJobPhases from "../studio/mindmaps/mindmapJobPhases.js";
import type * as studio_quizzes_index from "../studio/quizzes/index.js";
import type * as studio_quizzes_job from "../studio/quizzes/job.js";
import type * as studio_quizzes_quizJobPhases from "../studio/quizzes/quizJobPhases.js";
import type * as studio_reports_index from "../studio/reports/index.js";
import type * as studio_reports_job from "../studio/reports/job.js";
import type * as studio_reports_reportJobPhases from "../studio/reports/reportJobPhases.js";
import type * as studio_scheduling_flashcards from "../studio/scheduling/flashcards.js";
import type * as studio_scheduling_quizzes from "../studio/scheduling/quizzes.js";
import type * as studio_scheduling_reports from "../studio/scheduling/reports.js";
import type * as studio_scheduling_spreadsheets from "../studio/scheduling/spreadsheets.js";
import type * as studio_scheduling_writtenQuestions from "../studio/scheduling/writtenQuestions.js";
import type * as studio_slides_index from "../studio/slides/index.js";
import type * as studio_slides_job from "../studio/slides/job.js";
import type * as studio_slides_slideDeckJobPhases from "../studio/slides/slideDeckJobPhases.js";
import type * as studio_spreadsheets_index from "../studio/spreadsheets/index.js";
import type * as studio_spreadsheets_job from "../studio/spreadsheets/job.js";
import type * as studio_spreadsheets_spreadsheetJobPhases from "../studio/spreadsheets/spreadsheetJobPhases.js";
import type * as studio_wiki_index from "../studio/wiki/index.js";
import type * as studio_wiki_job from "../studio/wiki/job.js";
import type * as studio_writtenQuestions_grading from "../studio/writtenQuestions/grading.js";
import type * as studio_writtenQuestions_index from "../studio/writtenQuestions/index.js";
import type * as studio_writtenQuestions_job from "../studio/writtenQuestions/job.js";
import type * as studio_writtenQuestions_writtenQuestionsJobPhases from "../studio/writtenQuestions/writtenQuestionsJobPhases.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  ResendOTPPasswordReset: typeof ResendOTPPasswordReset;
  "_agents/AudioOverviewGraph": typeof _agents_AudioOverviewGraph;
  "_agents/ChatAgent": typeof _agents_ChatAgent;
  "_agents/FlashcardGraph": typeof _agents_FlashcardGraph;
  "_agents/MindMapGraph": typeof _agents_MindMapGraph;
  "_agents/QuizGraph": typeof _agents_QuizGraph;
  "_agents/ReportGraph": typeof _agents_ReportGraph;
  "_agents/SlideDeckGraph": typeof _agents_SlideDeckGraph;
  "_agents/SpreadsheetGraph": typeof _agents_SpreadsheetGraph;
  "_agents/WrittenQuestionsGraph": typeof _agents_WrittenQuestionsGraph;
  "_agents/_shared/agent_graph_limits": typeof _agents__shared_agent_graph_limits;
  "_agents/_shared/cachedLlm": typeof _agents__shared_cachedLlm;
  "_agents/_shared/chunk_helper_factory": typeof _agents__shared_chunk_helper_factory;
  "_agents/_shared/chunk_operations": typeof _agents__shared_chunk_operations;
  "_agents/_shared/citationExtract": typeof _agents__shared_citationExtract;
  "_agents/_shared/concurrency": typeof _agents__shared_concurrency;
  "_agents/_shared/graph_builder": typeof _agents__shared_graph_builder;
  "_agents/_shared/index": typeof _agents__shared_index;
  "_agents/_shared/jobHelpers": typeof _agents__shared_jobHelpers;
  "_agents/_shared/langsmith": typeof _agents__shared_langsmith;
  "_agents/_shared/llm_factory": typeof _agents__shared_llm_factory;
  "_agents/_shared/logging": typeof _agents__shared_logging;
  "_agents/_shared/markdownMathPrompt": typeof _agents__shared_markdownMathPrompt;
  "_agents/_shared/node_builder": typeof _agents__shared_node_builder;
  "_agents/_shared/progress": typeof _agents__shared_progress;
  "_agents/_shared/retry": typeof _agents__shared_retry;
  "_agents/_shared/sanitization": typeof _agents__shared_sanitization;
  "_agents/_shared/state_cleanup": typeof _agents__shared_state_cleanup;
  "_agents/_shared/state_factory": typeof _agents__shared_state_factory;
  "_agents/_shared/timeout": typeof _agents__shared_timeout;
  "_agents/_shared/tokenizer": typeof _agents__shared_tokenizer;
  "_agents/_shared/topic_extraction": typeof _agents__shared_topic_extraction;
  "_agents/_shared/validation": typeof _agents__shared_validation;
  "_agents/audio_overview/AudioOverviewGraph": typeof _agents_audio_overview_AudioOverviewGraph;
  "_agents/audio_overview/chunkHelpers": typeof _agents_audio_overview_chunkHelpers;
  "_agents/audio_overview/config": typeof _agents_audio_overview_config;
  "_agents/audio_overview/nodeCollapse": typeof _agents_audio_overview_nodeCollapse;
  "_agents/audio_overview/nodeExtractBeats": typeof _agents_audio_overview_nodeExtractBeats;
  "_agents/audio_overview/nodeSynthesizeAudio": typeof _agents_audio_overview_nodeSynthesizeAudio;
  "_agents/audio_overview/nodeWriteScript": typeof _agents_audio_overview_nodeWriteScript;
  "_agents/audio_overview/prompts": typeof _agents_audio_overview_prompts;
  "_agents/audio_overview/state": typeof _agents_audio_overview_state;
  "_agents/audio_overview/voices": typeof _agents_audio_overview_voices;
  "_agents/chat/chatHistoryBudget": typeof _agents_chat_chatHistoryBudget;
  "_agents/chat/chatRouter": typeof _agents_chat_chatRouter;
  "_agents/chat/chat_llm_grounding": typeof _agents_chat_chat_llm_grounding;
  "_agents/chat/chat_llm_prompts": typeof _agents_chat_chat_llm_prompts;
  "_agents/chat/chat_llm_types": typeof _agents_chat_chat_llm_types;
  "_agents/chat/chat_retrieval_subqueries": typeof _agents_chat_chat_retrieval_subqueries;
  "_agents/chat/grounding_validator": typeof _agents_chat_grounding_validator;
  "_agents/chat/hybrid_search": typeof _agents_chat_hybrid_search;
  "_agents/chat/llm_wrapper": typeof _agents_chat_llm_wrapper;
  "_agents/chat/rerankCache": typeof _agents_chat_rerankCache;
  "_agents/chat/sourceSuggestions": typeof _agents_chat_sourceSuggestions;
  "_agents/chat/vector_search": typeof _agents_chat_vector_search;
  "_agents/flashcard/FlashcardGraph": typeof _agents_flashcard_FlashcardGraph;
  "_agents/flashcard/chunkHelpers": typeof _agents_flashcard_chunkHelpers;
  "_agents/flashcard/collapseReduceLlm": typeof _agents_flashcard_collapseReduceLlm;
  "_agents/flashcard/config": typeof _agents_flashcard_config;
  "_agents/flashcard/flashcardHeuristics": typeof _agents_flashcard_flashcardHeuristics;
  "_agents/flashcard/formatFlashcards": typeof _agents_flashcard_formatFlashcards;
  "_agents/flashcard/nodeCollapse": typeof _agents_flashcard_nodeCollapse;
  "_agents/flashcard/nodeMap": typeof _agents_flashcard_nodeMap;
  "_agents/flashcard/nodeReduce": typeof _agents_flashcard_nodeReduce;
  "_agents/flashcard/nodeSplit": typeof _agents_flashcard_nodeSplit;
  "_agents/flashcard/prompts": typeof _agents_flashcard_prompts;
  "_agents/flashcard/routing": typeof _agents_flashcard_routing;
  "_agents/flashcard/state": typeof _agents_flashcard_state;
  "_agents/flashcard/structuredLlm": typeof _agents_flashcard_structuredLlm;
  "_agents/flashcard/textCleanup": typeof _agents_flashcard_textCleanup;
  "_agents/mindmap/MindMapGraph": typeof _agents_mindmap_MindMapGraph;
  "_agents/mindmap/chunkHelpers": typeof _agents_mindmap_chunkHelpers;
  "_agents/mindmap/config": typeof _agents_mindmap_config;
  "_agents/mindmap/fallbacks": typeof _agents_mindmap_fallbacks;
  "_agents/mindmap/nodeMap": typeof _agents_mindmap_nodeMap;
  "_agents/mindmap/nodeReduce": typeof _agents_mindmap_nodeReduce;
  "_agents/mindmap/parsing": typeof _agents_mindmap_parsing;
  "_agents/mindmap/prompts": typeof _agents_mindmap_prompts;
  "_agents/mindmap/routing": typeof _agents_mindmap_routing;
  "_agents/mindmap/state": typeof _agents_mindmap_state;
  "_agents/mindmap/structuredLlm": typeof _agents_mindmap_structuredLlm;
  "_agents/quiz/QuizGraph": typeof _agents_quiz_QuizGraph;
  "_agents/quiz/chunkHelpers": typeof _agents_quiz_chunkHelpers;
  "_agents/quiz/config": typeof _agents_quiz_config;
  "_agents/quiz/nodeCollapse": typeof _agents_quiz_nodeCollapse;
  "_agents/quiz/nodeMap": typeof _agents_quiz_nodeMap;
  "_agents/quiz/nodeReduce": typeof _agents_quiz_nodeReduce;
  "_agents/quiz/nodeSplit": typeof _agents_quiz_nodeSplit;
  "_agents/quiz/postprocess": typeof _agents_quiz_postprocess;
  "_agents/quiz/prompts": typeof _agents_quiz_prompts;
  "_agents/quiz/quizHeuristics": typeof _agents_quiz_quizHeuristics;
  "_agents/quiz/routing": typeof _agents_quiz_routing;
  "_agents/quiz/state": typeof _agents_quiz_state;
  "_agents/quiz/structuredLlm": typeof _agents_quiz_structuredLlm;
  "_agents/report/ReportGraph": typeof _agents_report_ReportGraph;
  "_agents/report/chunkHelpers": typeof _agents_report_chunkHelpers;
  "_agents/report/config": typeof _agents_report_config;
  "_agents/report/inputValidation": typeof _agents_report_inputValidation;
  "_agents/report/invokeHelpers": typeof _agents_report_invokeHelpers;
  "_agents/report/nodeCollapse": typeof _agents_report_nodeCollapse;
  "_agents/report/nodeMap": typeof _agents_report_nodeMap;
  "_agents/report/nodeMerge": typeof _agents_report_nodeMerge;
  "_agents/report/nodeReduce": typeof _agents_report_nodeReduce;
  "_agents/report/nodes": typeof _agents_report_nodes;
  "_agents/report/prompts": typeof _agents_report_prompts;
  "_agents/report/routing": typeof _agents_report_routing;
  "_agents/report/state": typeof _agents_report_state;
  "_agents/report/structuredLlm": typeof _agents_report_structuredLlm;
  "_agents/report/topicAnalysis": typeof _agents_report_topicAnalysis;
  "_agents/slides/SlideDeckGraph": typeof _agents_slides_SlideDeckGraph;
  "_agents/slides/chunkHelpers": typeof _agents_slides_chunkHelpers;
  "_agents/slides/config": typeof _agents_slides_config;
  "_agents/slides/nodeCollapse": typeof _agents_slides_nodeCollapse;
  "_agents/slides/nodeGenerateImages": typeof _agents_slides_nodeGenerateImages;
  "_agents/slides/nodeMap": typeof _agents_slides_nodeMap;
  "_agents/slides/nodeReduce": typeof _agents_slides_nodeReduce;
  "_agents/slides/nodeSplit": typeof _agents_slides_nodeSplit;
  "_agents/slides/prompts": typeof _agents_slides_prompts;
  "_agents/slides/routing": typeof _agents_slides_routing;
  "_agents/slides/services/SlideImageGenerationService": typeof _agents_slides_services_SlideImageGenerationService;
  "_agents/slides/slideHeuristics": typeof _agents_slides_slideHeuristics;
  "_agents/slides/state": typeof _agents_slides_state;
  "_agents/slides/structuredLlm": typeof _agents_slides_structuredLlm;
  "_agents/spreadsheet/SpreadsheetGraph": typeof _agents_spreadsheet_SpreadsheetGraph;
  "_agents/spreadsheet/chunkHelpers": typeof _agents_spreadsheet_chunkHelpers;
  "_agents/spreadsheet/config": typeof _agents_spreadsheet_config;
  "_agents/spreadsheet/csvHelpers": typeof _agents_spreadsheet_csvHelpers;
  "_agents/spreadsheet/inputValidation": typeof _agents_spreadsheet_inputValidation;
  "_agents/spreadsheet/nodeCollapse": typeof _agents_spreadsheet_nodeCollapse;
  "_agents/spreadsheet/nodeMap": typeof _agents_spreadsheet_nodeMap;
  "_agents/spreadsheet/nodeMerge": typeof _agents_spreadsheet_nodeMerge;
  "_agents/spreadsheet/nodeReduce": typeof _agents_spreadsheet_nodeReduce;
  "_agents/spreadsheet/prompts": typeof _agents_spreadsheet_prompts;
  "_agents/spreadsheet/routing": typeof _agents_spreadsheet_routing;
  "_agents/spreadsheet/state": typeof _agents_spreadsheet_state;
  "_agents/wiki/WikiGraph": typeof _agents_wiki_WikiGraph;
  "_agents/wiki/config": typeof _agents_wiki_config;
  "_agents/wiki/nodes": typeof _agents_wiki_nodes;
  "_agents/wiki/prompts": typeof _agents_wiki_prompts;
  "_agents/wiki/state": typeof _agents_wiki_state;
  "_agents/written_questions/WrittenQuestionsGraph": typeof _agents_written_questions_WrittenQuestionsGraph;
  "_agents/written_questions/chunkHelpers": typeof _agents_written_questions_chunkHelpers;
  "_agents/written_questions/config": typeof _agents_written_questions_config;
  "_agents/written_questions/nodeCollapse": typeof _agents_written_questions_nodeCollapse;
  "_agents/written_questions/nodeMap": typeof _agents_written_questions_nodeMap;
  "_agents/written_questions/nodeReduce": typeof _agents_written_questions_nodeReduce;
  "_agents/written_questions/nodeSplit": typeof _agents_written_questions_nodeSplit;
  "_agents/written_questions/postprocess": typeof _agents_written_questions_postprocess;
  "_agents/written_questions/prompts": typeof _agents_written_questions_prompts;
  "_agents/written_questions/questionHeuristics": typeof _agents_written_questions_questionHeuristics;
  "_agents/written_questions/routing": typeof _agents_written_questions_routing;
  "_agents/written_questions/state": typeof _agents_written_questions_state;
  "_agents/written_questions/structuredLlm": typeof _agents_written_questions_structuredLlm;
  "_lib/env": typeof _lib_env;
  "_lib/errors": typeof _lib_errors;
  "_lib/googleDriveDownload": typeof _lib_googleDriveDownload;
  "_lib/limits": typeof _lib_limits;
  "_lib/logging/serviceLogger": typeof _lib_logging_serviceLogger;
  "_lib/notebookAccess": typeof _lib_notebookAccess;
  "_lib/rateLimits": typeof _lib_rateLimits;
  "_lib/resendSendError": typeof _lib_resendSendError;
  "_lib/serviceErrors": typeof _lib_serviceErrors;
  "_lib/shareToken": typeof _lib_shareToken;
  "_lib/srsScheduling": typeof _lib_srsScheduling;
  "_lib/utils/urlValidation": typeof _lib_utils_urlValidation;
  "_model/audioOverviews": typeof _model_audioOverviews;
  "_model/conversations": typeof _model_conversations;
  "_model/documents": typeof _model_documents;
  "_model/flashcards": typeof _model_flashcards;
  "_model/folders": typeof _model_folders;
  "_model/mindmaps": typeof _model_mindmaps;
  "_model/notebooks": typeof _model_notebooks;
  "_model/notes": typeof _model_notes;
  "_model/quizzes": typeof _model_quizzes;
  "_model/reports": typeof _model_reports;
  "_model/slides": typeof _model_slides;
  "_model/spreadsheets": typeof _model_spreadsheets;
  "_model/wiki": typeof _model_wiki;
  "_model/writtenQuestions": typeof _model_writtenQuestions;
  "_services/ai/embeddings": typeof _services_ai_embeddings;
  "_services/ai/titleGenerator": typeof _services_ai_titleGenerator;
  "_services/ai/togetherTts": typeof _services_ai_togetherTts;
  "_services/cache/cache": typeof _services_cache_cache;
  "_services/cache/cacheCrypto": typeof _services_cache_cacheCrypto;
  "_services/cache/cacheMetrics": typeof _services_cache_cacheMetrics;
  "_services/cache/cachedAgent": typeof _services_cache_cachedAgent;
  "_services/extraction/AudioTranscriptionService": typeof _services_extraction_AudioTranscriptionService;
  "_services/extraction/MistralOCRService": typeof _services_extraction_MistralOCRService;
  "_services/extraction/SupadataLoaderService": typeof _services_extraction_SupadataLoaderService;
  "_services/extractors": typeof _services_extractors;
  "_services/grading/WrittenQuestionsGradingService": typeof _services_grading_WrittenQuestionsGradingService;
  "_services/processing/DocumentMetadataExtractor": typeof _services_processing_DocumentMetadataExtractor;
  "_services/processing/EmbeddingServiceClient": typeof _services_processing_EmbeddingServiceClient;
  "_services/processing/StructuralChunker": typeof _services_processing_StructuralChunker;
  "_services/processing/TextSplitterService": typeof _services_processing_TextSplitterService;
  "_services/search/DiscoveryService": typeof _services_search_DiscoveryService;
  "_services/search/OpenAlexSearchService": typeof _services_search_OpenAlexSearchService;
  "_services/search/TavilySearchService": typeof _services_search_TavilySearchService;
  "_shared/mathMarkdown": typeof _shared_mathMarkdown;
  auth: typeof auth;
  "billing/actions": typeof billing_actions;
  "billing/index": typeof billing_index;
  "billing/webhook": typeof billing_webhook;
  "chat/conversations": typeof chat_conversations;
  "chat/index": typeof chat_index;
  "chat/messages": typeof chat_messages;
  "chat/sourceSuggestions": typeof chat_sourceSuggestions;
  "chat/stream": typeof chat_stream;
  "documents/embeddingJob": typeof documents_embeddingJob;
  "documents/embeddings": typeof documents_embeddings;
  "documents/index": typeof documents_index;
  "documents/refreshRemote": typeof documents_refreshRemote;
  "folders/index": typeof folders_index;
  googleDrive: typeof googleDrive;
  http: typeof http;
  "notebooks/_forkNotebook": typeof notebooks__forkNotebook;
  "notebooks/index": typeof notebooks_index;
  "notebooks/sharing": typeof notebooks_sharing;
  "notes/index": typeof notes_index;
  "notes/userNotes": typeof notes_userNotes;
  "push/index": typeof push_index;
  "scripts/fixAudioUrls": typeof scripts_fixAudioUrls;
  "scripts/runFixAudioUrls": typeof scripts_runFixAudioUrls;
  server: typeof server;
  "storage/ChatHistoryService": typeof storage_ChatHistoryService;
  "storage/ConvexStorageService": typeof storage_ConvexStorageService;
  "storage/VectorStoreService": typeof storage_VectorStoreService;
  "studio/_job/collapseStringOutputsByTokens": typeof studio__job_collapseStringOutputsByTokens;
  "studio/_job/invokeStudioLlm": typeof studio__job_invokeStudioLlm;
  "studio/audio/audioJobPhases": typeof studio_audio_audioJobPhases;
  "studio/audio/fixAudioUrl": typeof studio_audio_fixAudioUrl;
  "studio/audio/index": typeof studio_audio_index;
  "studio/audio/job": typeof studio_audio_job;
  "studio/flashcards/flashcardJobPhases": typeof studio_flashcards_flashcardJobPhases;
  "studio/flashcards/index": typeof studio_flashcards_index;
  "studio/flashcards/job": typeof studio_flashcards_job;
  "studio/jobMutations/audio": typeof studio_jobMutations_audio;
  "studio/jobMutations/documents": typeof studio_jobMutations_documents;
  "studio/jobMutations/flashcards": typeof studio_jobMutations_flashcards;
  "studio/jobMutations/jobErrorUtils": typeof studio_jobMutations_jobErrorUtils;
  "studio/jobMutations/mindmaps": typeof studio_jobMutations_mindmaps;
  "studio/jobMutations/quizzes": typeof studio_jobMutations_quizzes;
  "studio/jobMutations/reports": typeof studio_jobMutations_reports;
  "studio/jobMutations/slides": typeof studio_jobMutations_slides;
  "studio/jobMutations/spreadsheets": typeof studio_jobMutations_spreadsheets;
  "studio/jobMutations/writtenQuestions": typeof studio_jobMutations_writtenQuestions;
  "studio/mindmaps/index": typeof studio_mindmaps_index;
  "studio/mindmaps/job": typeof studio_mindmaps_job;
  "studio/mindmaps/mindmapJobPhases": typeof studio_mindmaps_mindmapJobPhases;
  "studio/quizzes/index": typeof studio_quizzes_index;
  "studio/quizzes/job": typeof studio_quizzes_job;
  "studio/quizzes/quizJobPhases": typeof studio_quizzes_quizJobPhases;
  "studio/reports/index": typeof studio_reports_index;
  "studio/reports/job": typeof studio_reports_job;
  "studio/reports/reportJobPhases": typeof studio_reports_reportJobPhases;
  "studio/scheduling/flashcards": typeof studio_scheduling_flashcards;
  "studio/scheduling/quizzes": typeof studio_scheduling_quizzes;
  "studio/scheduling/reports": typeof studio_scheduling_reports;
  "studio/scheduling/spreadsheets": typeof studio_scheduling_spreadsheets;
  "studio/scheduling/writtenQuestions": typeof studio_scheduling_writtenQuestions;
  "studio/slides/index": typeof studio_slides_index;
  "studio/slides/job": typeof studio_slides_job;
  "studio/slides/slideDeckJobPhases": typeof studio_slides_slideDeckJobPhases;
  "studio/spreadsheets/index": typeof studio_spreadsheets_index;
  "studio/spreadsheets/job": typeof studio_spreadsheets_job;
  "studio/spreadsheets/spreadsheetJobPhases": typeof studio_spreadsheets_spreadsheetJobPhases;
  "studio/wiki/index": typeof studio_wiki_index;
  "studio/wiki/job": typeof studio_wiki_job;
  "studio/writtenQuestions/grading": typeof studio_writtenQuestions_grading;
  "studio/writtenQuestions/index": typeof studio_writtenQuestions_index;
  "studio/writtenQuestions/job": typeof studio_writtenQuestions_job;
  "studio/writtenQuestions/writtenQuestionsJobPhases": typeof studio_writtenQuestions_writtenQuestionsJobPhases;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  stripe: {
    private: {
      handleCheckoutSessionCompleted: FunctionReference<
        "mutation",
        "internal",
        {
          metadata?: any;
          mode: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        },
        null
      >;
      handleCustomerCreated: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        null
      >;
      handleCustomerUpdated: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        null
      >;
      handleInvoiceCreated: FunctionReference<
        "mutation",
        "internal",
        {
          amountDue: number;
          amountPaid: number;
          created: number;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
        },
        null
      >;
      handleInvoicePaid: FunctionReference<
        "mutation",
        "internal",
        { amountPaid: number; stripeInvoiceId: string },
        null
      >;
      handleInvoicePaymentFailed: FunctionReference<
        "mutation",
        "internal",
        { stripeInvoiceId: string },
        null
      >;
      handlePaymentIntentSucceeded: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
        },
        null
      >;
      handleSubscriptionCreated: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
        },
        null
      >;
      handleSubscriptionDeleted: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd?: boolean;
          currentPeriodEnd?: number;
          stripeSubscriptionId: string;
        },
        null
      >;
      handleSubscriptionUpdated: FunctionReference<
        "mutation",
        "internal",
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          priceId?: string;
          quantity?: number;
          status: string;
          stripeSubscriptionId: string;
        },
        null
      >;
      listSubscriptionsWithCreationTime: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          _creationTime: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
        }>
      >;
      updatePaymentCustomer: FunctionReference<
        "mutation",
        "internal",
        { stripeCustomerId: string; stripePaymentIntentId: string },
        null
      >;
      updateSubscriptionQuantityInternal: FunctionReference<
        "mutation",
        "internal",
        { quantity: number; stripeSubscriptionId: string },
        null
      >;
    };
    public: {
      createOrUpdateCustomer: FunctionReference<
        "mutation",
        "internal",
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
        },
        string
      >;
      getCheckoutSession: FunctionReference<
        "query",
        "internal",
        { stripeCheckoutSessionId: string },
        {
          metadata?: any;
          mode: string;
          status: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        } | null
      >;
      getCustomer: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
          userId?: string;
        } | null
      >;
      getCustomerByEmail: FunctionReference<
        "query",
        "internal",
        { email: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
          userId?: string;
        } | null
      >;
      getCustomerByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          email?: string;
          metadata?: any;
          name?: string;
          stripeCustomerId: string;
          userId?: string;
        } | null
      >;
      getPayment: FunctionReference<
        "query",
        "internal",
        { stripePaymentIntentId: string },
        {
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        } | null
      >;
      getSubscription: FunctionReference<
        "query",
        "internal",
        { stripeSubscriptionId: string },
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        } | null
      >;
      getSubscriptionByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        {
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        } | null
      >;
      listCheckoutSessions: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          metadata?: any;
          mode: string;
          status: string;
          stripeCheckoutSessionId: string;
          stripeCustomerId?: string;
        }>
      >;
      listInvoices: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listInvoicesByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listInvoicesByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amountDue: number;
          amountPaid: number;
          created: number;
          orgId?: string;
          status: string;
          stripeCustomerId: string;
          stripeInvoiceId: string;
          stripeSubscriptionId?: string;
          userId?: string;
        }>
      >;
      listPayments: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listPaymentsByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listPaymentsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          amount: number;
          created: number;
          currency: string;
          metadata?: any;
          orgId?: string;
          status: string;
          stripeCustomerId?: string;
          stripePaymentIntentId: string;
          userId?: string;
        }>
      >;
      listSubscriptions: FunctionReference<
        "query",
        "internal",
        { stripeCustomerId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      listSubscriptionsByOrgId: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      listSubscriptionsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          cancelAt?: number;
          cancelAtPeriodEnd: boolean;
          currentPeriodEnd: number;
          metadata?: any;
          orgId?: string;
          priceId: string;
          quantity?: number;
          status: string;
          stripeCustomerId: string;
          stripeSubscriptionId: string;
          userId?: string;
        }>
      >;
      updateSubscriptionMetadata: FunctionReference<
        "mutation",
        "internal",
        {
          metadata: any;
          orgId?: string;
          stripeSubscriptionId: string;
          userId?: string;
        },
        null
      >;
      updateSubscriptionQuantity: FunctionReference<
        "action",
        "internal",
        { quantity: number; stripeSubscriptionId: string },
        null
      >;
    };
  };
  persistentTextStreaming: {
    lib: {
      addChunk: FunctionReference<
        "mutation",
        "internal",
        { final: boolean; streamId: string; text: string },
        any
      >;
      createStream: FunctionReference<"mutation", "internal", {}, any>;
      deleteStream: FunctionReference<
        "mutation",
        "internal",
        { streamId: string },
        null
      >;
      getStreamStatus: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        "pending" | "streaming" | "done" | "error" | "timeout"
      >;
      getStreamText: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        {
          status: "pending" | "streaming" | "done" | "error" | "timeout";
          text: string;
        }
      >;
      setStreamStatus: FunctionReference<
        "mutation",
        "internal",
        {
          status: "pending" | "streaming" | "done" | "error" | "timeout";
          streamId: string;
        },
        any
      >;
    };
  };
  actionCache: {
    crons: {
      purge: FunctionReference<
        "mutation",
        "internal",
        { expiresAt?: number },
        null
      >;
    };
    lib: {
      get: FunctionReference<
        "query",
        "internal",
        { args: any; name: string; ttl: number | null },
        { kind: "hit"; value: any } | { expiredEntry?: string; kind: "miss" }
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          args: any;
          expiredEntry?: string;
          name: string;
          ttl: number | null;
          value: any;
        },
        { cacheHit: boolean; deletedExpiredEntry: boolean }
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { args: any; name: string },
        null
      >;
      removeAll: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number; before?: number; name?: string },
        null
      >;
    };
  };
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
};
