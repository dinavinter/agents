helm install yjs-backend-ws ./chart/yjs-backend-ws --namespace yjs \
 --set image.tag=test \
 --set secret.db_host="psql-postgresql.postgresql.svc.cluster.local:5432" \
 --set secret.db_user="test_user" \
 --set secret.db_password="mypass" \
 --set secret.db_name="yjs_db" \
 --set secret.redis_host="redis-master.redis.svc.cluster.local" \
 --set secret.redis_port="6379" \
 --set secret.redis_prefix="backend.crdtwss."