from ragas.metrics.collections import Faithfulness, AnswerRelevancy, ContextPrecision, ContextRecall
import inspect
print('Faithfulness:', inspect.signature(Faithfulness.__init__))
print('AnswerRelevancy:', inspect.signature(AnswerRelevancy.__init__))
print('ContextPrecision:', inspect.signature(ContextPrecision.__init__))
print('ContextRecall:', inspect.signature(ContextRecall.__init__))
