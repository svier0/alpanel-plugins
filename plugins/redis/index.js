const redis = {
	plugin_name: "redis",
	width: "600",

	setup(ctx){
		return {};
	},

	render(h, state){
		return h('div',{ class: 'app' },[]);
	},

	style(){
		return `
			.app{display:flex;height:100%;min-height:400px;background:#000;}
		`;
	}
};
Plugin(redis).show();