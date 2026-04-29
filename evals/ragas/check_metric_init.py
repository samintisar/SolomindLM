# Try creating a metric without args
from ragas.metrics.collections import Faithfulness
try:
    m = Faithfulness()
    print('Faithfulness() works:', m)
except Exception as e:
    print('Faithfulness() failed:', e)

# Try with no-arg constructor
try:
    from ragas.metrics import faithfulness
    print('faithfulness from ragas.metrics:', faithfulness)
except Exception as e:
    print('faithfulness from ragas.metrics failed:', e)
