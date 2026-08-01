const php84 = {
	plugin_name: 'php84',
	setup(ctx){ return {}; },
	render(h, state){
		return h('div', { class: 'app' }, [ h('p', { class: 'tip' }, '该插件暂无管理界面') ]);
	},
	style(){
		return `
			.app{display:flex;height:100%;min-height:400px;background:#141414;color:#ccc;}
			.tip{color:#666;font-size:13px;padding:20px;}
		`;
	}
};
Plugin(php84).show();
