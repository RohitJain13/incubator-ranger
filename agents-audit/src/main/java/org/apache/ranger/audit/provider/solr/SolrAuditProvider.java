/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.apache.ranger.audit.provider.solr;

import java.util.Date;
import java.util.Properties;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.ranger.audit.model.AuditEventBase;
import org.apache.ranger.audit.model.AuthzAuditEvent;
import org.apache.ranger.audit.provider.BaseAuditProvider;
import org.apache.ranger.audit.provider.MiscUtil;
import org.apache.solr.client.solrj.SolrClient;
import org.apache.solr.client.solrj.impl.HttpSolrClient;
import org.apache.solr.client.solrj.response.UpdateResponse;
import org.apache.solr.common.SolrInputDocument;

public class SolrAuditProvider extends BaseAuditProvider {
	private static final Log LOG = LogFactory.getLog(SolrAuditProvider.class);

	public static final String AUDIT_MAX_QUEUE_SIZE_PROP = "xasecure.audit.solr.async.max.queue.size";
	public static final String AUDIT_MAX_FLUSH_INTERVAL_PROP = "xasecure.audit.solr.async.max.flush.interval.ms";
	public static final String AUDIT_RETRY_WAIT_PROP = "xasecure.audit.solr.retry.ms";

	static final Object lock = new Object();
	SolrClient solrClient = null;
	Date lastConnectTime = null;
	long lastFailTime = 0;

	int retryWaitTime = 30000;

	public SolrAuditProvider() {
	}

	@Override
	public void init(Properties props) {
		LOG.info("init() called");
		super.init(props);

		setMaxQueueSize(BaseAuditProvider.getIntProperty(props,
				AUDIT_MAX_QUEUE_SIZE_PROP, AUDIT_ASYNC_MAX_QUEUE_SIZE_DEFAULT));
		setMaxFlushInterval(BaseAuditProvider.getIntProperty(props,
				AUDIT_MAX_QUEUE_SIZE_PROP,
				AUDIT_ASYNC_MAX_FLUSH_INTERVAL_DEFAULT));
		retryWaitTime = BaseAuditProvider.getIntProperty(props,
				AUDIT_RETRY_WAIT_PROP, retryWaitTime);
	}

	void connect() {
		if (solrClient == null) {
			synchronized (lock) {
				if (solrClient == null) {
					String solrURL = BaseAuditProvider.getStringProperty(props,
							"xasecure.audit.solr.solr_url");

					if (lastConnectTime != null) {
						// Let's wait for enough time before retrying
						long diff = System.currentTimeMillis()
								- lastConnectTime.getTime();
						if (diff < retryWaitTime) {
							if (LOG.isDebugEnabled()) {
								LOG.debug("Ignore connecting to solr url="
										+ solrURL + ", lastConnect=" + diff
										+ "ms");
							}
							return;
						}
					}
					lastConnectTime = new Date();

					if (solrURL == null || solrURL.isEmpty()) {
						LOG.fatal("Solr URL for Audit is empty");
						return;
					}

					try {
						// TODO: Need to support SolrCloud also
						solrClient = new HttpSolrClient(solrURL);
						if (solrClient instanceof HttpSolrClient) {
							HttpSolrClient httpSolrClient = (HttpSolrClient) solrClient;
							httpSolrClient.setAllowCompression(true);
							httpSolrClient.setConnectionTimeout(1000);
							// solrClient.setSoTimeout(10000);
							httpSolrClient.setMaxRetries(1);
						}
					} catch (Throwable t) {
						LOG.fatal("Can't connect to Solr server. URL="
								+ solrURL, t);
					}
				}
			}
		}
	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see
	 * org.apache.ranger.audit.provider.AuditProvider#log(org.apache.ranger.
	 * audit.model.AuditEventBase)
	 */
	@Override
	public void log(AuditEventBase event) {
		if (!(event instanceof AuthzAuditEvent)) {
			LOG.error(event.getClass().getName()
					+ " audit event class type is not supported");
			return;
		}
		AuthzAuditEvent authzEvent = (AuthzAuditEvent) event;
		// TODO: This should be done at a higher level

		if (authzEvent.getAgentHostname() == null) {
			authzEvent.setAgentHostname(MiscUtil.getHostname());
		}

		if (authzEvent.getLogType() == null) {
			authzEvent.setLogType("RangerAudit");
		}

		if (authzEvent.getEventId() == null) {
			authzEvent.setEventId(MiscUtil.generateUniqueId());
		}

		try {
			if (solrClient == null) {
				connect();
				if (solrClient == null) {
					// Solr is still not initialized. So need to throw error
					return;
				}
			}

			if (lastFailTime > 0) {
				long diff = System.currentTimeMillis() - lastFailTime;
				if (diff < retryWaitTime) {
					if (LOG.isDebugEnabled()) {
						LOG.debug("Ignore sending audit. lastConnect=" + diff
								+ " ms");
					}
					return;
				}
			}
			// Convert AuditEventBase to Solr document
			SolrInputDocument document = toSolrDoc(authzEvent);
			UpdateResponse response = solrClient.add(document);
			if (response.getStatus() != 0) {
				lastFailTime = System.currentTimeMillis();

				// System.out.println("Response=" + response.toString()
				// + ", status= " + response.getStatus() + ", event="
				// + event);
				// throw new Exception("Aborting. event=" + event +
				// ", response="
				// + response.toString());
			} else {
				lastFailTime = 0;
			}

		} catch (Throwable t) {
			LOG.error("Error sending message to Solr", t);
		}

	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see org.apache.ranger.audit.provider.AuditProvider#start()
	 */
	@Override
	public void start() {
		connect();
	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see org.apache.ranger.audit.provider.AuditProvider#stop()
	 */
	@Override
	public void stop() {
		// TODO Auto-generated method stub

	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see org.apache.ranger.audit.provider.AuditProvider#waitToComplete()
	 */
	@Override
	public void waitToComplete() {
		// TODO Auto-generated method stub

	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see org.apache.ranger.audit.provider.AuditProvider#isFlushPending()
	 */
	@Override
	public boolean isFlushPending() {
		// TODO Auto-generated method stub
		return false;
	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see org.apache.ranger.audit.provider.AuditProvider#getLastFlushTime()
	 */
	@Override
	public long getLastFlushTime() {
		// TODO Auto-generated method stub
		return 0;
	}

	/*
	 * (non-Javadoc)
	 * 
	 * @see org.apache.ranger.audit.provider.AuditProvider#flush()
	 */
	@Override
	public void flush() {
		// TODO Auto-generated method stub

	}

	SolrInputDocument toSolrDoc(AuthzAuditEvent auditEvent) {
		SolrInputDocument doc = new SolrInputDocument();
		doc.addField("id", auditEvent.getEventId());
		doc.addField("access", auditEvent.getAccessType());
		doc.addField("enforcer", auditEvent.getAclEnforcer());
		doc.addField("agent", auditEvent.getAgentId());
		doc.addField("repo", auditEvent.getRepositoryName());
		doc.addField("sess", auditEvent.getSessionId());
		doc.addField("reqUser", auditEvent.getUser());
		doc.addField("reqData", auditEvent.getRequestData());
		doc.addField("resource", auditEvent.getResourcePath());
		doc.addField("cliIP", auditEvent.getClientIP());
		doc.addField("logType", auditEvent.getLogType());
		doc.addField("result", auditEvent.getAccessResult());
		doc.addField("policy", auditEvent.getPolicyId());
		doc.addField("repoType", auditEvent.getRepositoryType());
		doc.addField("resType", auditEvent.getResourceType());
		doc.addField("reason", auditEvent.getResultReason());
		doc.addField("action", auditEvent.getAction());
		doc.addField("evtTime", auditEvent.getEventTime());
		return doc;
	}
	
	public boolean isAsync() {
		return true;
	}

}
