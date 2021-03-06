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

 
define(function(require){
    'use strict';

	var Backbone		= require('backbone');
	var SessionMgr		= require('mgrs/SessionMgr');
	
	var VXGroupList		= require('collections/VXGroupList');
	var localization	= require('utils/XALangSupport');
	var XAEnums			= require('utils/XAEnums');
	var XAUtils			= require('utils/XAUtils');
	var AddGroup 		= require('views/common/AddGroup');
	
	require('backbone-forms');
	require('backbone-forms.templates');
	var UserForm = Backbone.Form.extend(
	/** @lends UserForm */
	{
		_viewName : 'UserForm',

    	/**
		* intialize a new UserForm Form View 
		* @constructs
		*/
		initialize: function(options) {
			console.log("initialized a UserForm Form View");
			_.extend(this, _.pick(options,'groupList','showBasicFields'));
    		Backbone.Form.prototype.initialize.call(this, options);

			this.bindEvents();
		},

		/** all events binding here */
		bindEvents : function(){
			this.on('userRoleList:change', function(form, fieldEditor){
				//this.userRoleListChange(form, fieldEditor);
    		});
		},
		/** fields for the form
		*/
		fields: ['name', 'description'],
		schema :function(){
			return{
				name : {
					type		: 'Text',
					title		: localization.tt("lbl.userName") +' *',
					validators  : ['required',{type:'regexp',regexp:/^[a-z0-9][a-z0-9,._'-]+$/i,message :"Name should start with alpha/numeric letters and can have special characters ,._'-"}],
					editorAttrs :{'maxlength': 32}
				},
				password : {
					type		: 'Password',
					title		: localization.tt("lbl.newPassword") +' *',
					validators  : ['required', {type: 'match', field: 'passwordConfirm', message: 'Passwords must match!'},
					               {type:'regexp',regexp:/^.*(?=.{8,256})(?=.*\d)(?=.*[a-zA-Z]).*$/,message :localization.tt('validationMessages.passwordError')}],
					editorAttrs  : {'onpaste':'return false;','oncopy':'return false;','autocomplete':'off'}               
				},
				passwordConfirm : {
					type		: 'Password',
					title		: localization.tt("lbl.passwordConfirm") +' *',
					validators  : ['required',
					               {type:'regexp',regexp:/^.*(?=.{8,256})(?=.*\d)(?=.*[a-zA-Z]).*$/,message :localization.tt('validationMessages.passwordError')}],
					editorAttrs  : {'onpaste':'return false;','oncopy':'return false;','autocomplete':'off'}
				},
				firstName : { 
					type		: 'Text',
					title		: localization.tt("lbl.firstName")+' *',
					validators  : ['required',{type:'regexp',regexp:/^[a-zA-Z][a-z0-9- ]*[a-zA-Z0-9]+$/,message :'First name should start with alphabets & can have hyphen, space.'}]
				},
				lastName : { 
					type		: 'Text',
					title		: localization.tt("lbl.lastName"),
					validators  : [{type:'regexp',regexp:/^[a-zA-Z][a-z0-9- ]*[a-zA-Z0-9]+$/,message :'Last name should start with alphabets & can have hyphen, space.'}]
				},
				emailAddress : {
					type		: 'Text',
					title		: localization.tt("lbl.emailAddress"),
					validators  : ['email']
				},
				userRoleList : {
					type : 'Select',
					options : function(callback, editor){
						var userTypes = _.filter(XAEnums.UserRoles,function(m){return m.label != 'Unknown'});
						var nvPairs = XAUtils.enumToSelectPairs(userTypes);
						callback(nvPairs);
					},
					title : localization.tt('lbl.selectRole')+' *'
				}
			};	
		},
		/** on render callback */
		render: function(options) {
			var that = this;
			 Backbone.Form.prototype.render.call(this, options);
			this.renderCustomFields();
			this.initializePlugins();
			this.showCustomFields();
			if(!that.model.isNew()){
				this.fields.name.editor.$el.attr('disabled',true);
				if(this.model.has('userRoleList')){
					var roleList = this.model.get('userRoleList');
					if(!_.isUndefined(roleList) && roleList.length > 0){
						if(XAEnums.UserRoles[roleList[0]].value == XAEnums.UserRoles.ROLE_USER.value)
							this.fields.userRoleList.setValue(XAEnums.UserRoles.ROLE_USER.value);
						else
							this.fields.userRoleList.setValue(XAEnums.UserRoles.ROLE_SYS_ADMIN.value);
					}
				}
				if(!_.isUndefined(this.model.get('userSource')) && this.model.get('userSource') == XAEnums.UserSource.XA_USER.value){
					this.fields.password.editor.$el.attr('disabled',true);
					this.fields.passwordConfirm.editor.$el.attr('disabled',true);
					this.fields.firstName.editor.$el.attr('disabled',true);
					this.fields.lastName.editor.$el.attr('disabled',true);
					this.fields.emailAddress.editor.$el.attr('disabled',true);
					this.fields.userRoleList.editor.$el.attr('disabled',true);
					
				}
				
				if(SessionMgr.getUserProfile().get('loginId') != "admin"){
					if(this.model.get('name') != "admin"){
						if(_.contains(SessionMgr.getUserProfile().get('userRoleList'),'ROLE_SYS_ADMIN')){
							this.fields.userRoleList.editor.$el.attr('disabled',false);
						}else{
							this.fields.userRoleList.editor.$el.attr('disabled',true);
						}
					}else{
						this.fields.userRoleList.editor.$el.attr('disabled',true);
					}
				}else{
					this.fields.userRoleList.editor.$el.attr('disabled',false);
				}
				//User does not allowed to change his role (it's own role)
				if(this.model.get('name') == SessionMgr.getUserProfile().get('loginId')){
					this.fields.userRoleList.editor.$el.attr('disabled',true);
				}
			}			
		},
		renderCustomFields: function(){
			var that = this;
			that.$('[data-customfields="groupIdList"]').html(new AddGroup({
				model : that.model
			}).render().el);
			if(!that.showBasicFields)
				that.$('[data-customfields="groupIdList"]').hide();
		},
		showCustomFields : function(){
			if(!this.showBasicFields){
				this.fields.name.$el.hide();
				this.fields.firstName.$el.hide();
				this.fields.lastName.$el.hide();
				this.fields.emailAddress.$el.hide();
				this.fields.userRoleList.$el.hide();
				
				this.fields.name.editor.validators = this.removeElementFromArr(this.fields.name.editor.validators , 'required');
				this.fields.firstName.editor.validators = this.removeElementFromArr(this.fields.firstName.editor.validators , 'required');
				this.fields.emailAddress.editor.validators = this.removeElementFromArr(this.fields.emailAddress.editor.validators , 'required');

				this.fields.password.$el.show();
				this.fields.passwordConfirm.$el.show();
			}
			if(	(!this.model.isNew() && (this.showBasicFields))){
				this.fields.password.$el.hide();
				this.fields.passwordConfirm.$el.hide();
				
				this.fields.password.editor.validators = [];
				this.fields.passwordConfirm.editor.validators = [];
				//Remove validation checks for external users
				if(this.model.get('userSource') == XAEnums.UserSource.XA_USER.value){
					this.fields.firstName.editor.validators = [];
					var labelStr = this.fields.firstName.$el.find('label').html().replace('*','');
					this.fields.firstName.$el.find('label').html(labelStr);	
				}
			}
		},
		removeElementFromArr : function(arr ,elem){
			var index = $.inArray(elem,arr);
			if(index >= 0) arr.splice(index,1);
			return arr;
		},
		beforeSaveUserDetail : function(){
			if(this.model.get('userSource') != XAEnums.UserSource.XA_USER.value){
				var groupArr = this.$('[data-customfields="groupIdList"]').find('.tags').editable('getValue', true);
				if(_.isNumber(groupArr)){
					groupArr = groupArr.toString().split(',');
				}
				this.model.set('groupIdList',groupArr);
				this.model.set('status',XAEnums.ActivationStatus.ACT_STATUS_ACTIVE.value);
				this.model.unset('passwordConfirm');
			}
			if(!this.model.isNew()){
				this.model.unset('password');
			}
			//FOR USER ROLE
			if(this.fields.userRoleList.getValue() == XAEnums.UserRoles.ROLE_USER.value){
				this.model.set('userRoleList',["ROLE_USER"]);
			}else{
				this.model.set('userRoleList',["ROLE_SYS_ADMIN"]);
			}
			return true;
		},
		beforeSavePasswordDetail : function(){
			this.model.unset('passwordConfirm');
			this.model.unset('userRoleList');
			
		},
		/** all post render plugin initialization */
		initializePlugins: function(){
		}
		
	});

	return UserForm;
});
